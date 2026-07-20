import {
  DynamoDBClient,
  QueryCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import { persistFieldTask } from "./persistFieldTask.mjs";

const API_KEY = process.env.WODELY_API_KEY || "pk-4a19da85-b-46f62a66-205a-42af-9dab-a7d3778588b6";
const WODELY_API_URL = "https://api.wodely.com/v2/tasks/search";

const TABLE_NAME = "WOO-tasks";
const GSI_NAME = "AfterDateTime";

const APPLY_UPDATES = true;

const dynamoDBClient = new DynamoDBClient({});

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const TIME_TOLERANCE_SECONDS = 1;

function unmarshallItem(item) {
  const out = {};
  for (const [k, v] of Object.entries(item)) {
    if (v.S !== undefined) out[k] = v.S;
    else if (v.N !== undefined) out[k] = Number(v.N);
    else if (v.BOOL !== undefined) out[k] = v.BOOL;
  }
  return out;
}

function toEpochSeconds(iso) {
  return Math.floor(new Date(iso).getTime() / 1000);
}

async function fetchApiTasks(startIso, endIso) {
  const res = await fetch(WODELY_API_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Basic ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      startDateTime: startIso,
      endDateTime: endIso,
    }),
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json?.message || "API fetch failed");
  }

  console.log("API_FETCH", { startIso, endIso, count: json.data?.length || 0 });

  return json.data || [];
}

async function queryDdbByAfterDateTime(startIso, endIso) {
  let items = [];
  let lastKey;

  do {
    const cmd = new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: GSI_NAME,
      KeyConditionExpression:
        "PK = :pk AND AfterDateTime BETWEEN :start AND :end",
      ExpressionAttributeValues: {
        ":pk": { S: "TASK" },
        ":start": { S: startIso },
        ":end": { S: endIso },
      },
      ExclusiveStartKey: lastKey,
    });

    const res = await dynamoDBClient.send(cmd);
    if (res.Items) items.push(...res.Items);
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);

  console.log("DDB_QUERY", { startIso, endIso, count: items.length });

  return items;
}

async function applyUpdate(dbItem, apiTask) {
  const cmd = new UpdateItemCommand({
    TableName: TABLE_NAME,
    Key: {
      id: { S: String(dbItem.id) },
      externalKey: { S: dbItem.externalKey || "N/A" },
    },
    UpdateExpression: `
			SET ModifiedDateTime = :apiMdt,
			    LastSyncedAt = :now
		`,
    ConditionExpression: `
			attribute_not_exists(ModifiedDateTime)
			OR ModifiedDateTime < :apiMdt
		`,
    ExpressionAttributeValues: {
      ":apiMdt": { S: apiTask.modifiedDateTime },
      ":now": { S: new Date().toISOString() },
    },
  });

  await dynamoDBClient.send(cmd);
}

async function applyArchive(dbItem) {
  const cmd = new UpdateItemCommand({
    TableName: TABLE_NAME,
    Key: {
      id: { S: String(dbItem.id) },
      externalKey: { S: dbItem.externalKey || "N/A" },
    },
    UpdateExpression: `
			SET Archived = :true,
			    ArchivedAt = :now
		`,
    ConditionExpression: "attribute_not_exists(Archived) OR Archived = :false",
    ExpressionAttributeValues: {
      ":true": { BOOL: true },
      ":false": { BOOL: false },
      ":now": { S: new Date().toISOString() },
    },
  });

  await dynamoDBClient.send(cmd);
}

export const handler = async () => {
  try {
    const now = new Date();
    console.log("RUN_START", { timestamp: now.toISOString() });

    const windows = [
      {
        start: new Date(now.getTime() - 90 * ONE_DAY_MS),
        end: new Date(now.getTime() - 30 * ONE_DAY_MS),
      },
      {
        start: new Date(now.getTime() - 30 * ONE_DAY_MS),
        end: new Date(now.getTime() + 30 * ONE_DAY_MS),
      },
      {
        start: new Date(now.getTime() + 30 * ONE_DAY_MS),
        end: new Date(now.getTime() + 90 * ONE_DAY_MS),
      },
    ];

    const apiTasksById = {};
    for (const w of windows) {
      const tasks = await fetchApiTasks(
        w.start.toISOString(),
        w.end.toISOString(),
      );
      for (const t of tasks) {
        apiTasksById[t.id] = t;
      }
    }

    const dbItemsById = {};
    for (const w of windows) {
      const rawItems = await queryDdbByAfterDateTime(
        w.start.toISOString(),
        w.end.toISOString(),
      );
      for (const raw of rawItems) {
        const item = unmarshallItem(raw);
        if (item.id) dbItemsById[item.id] = item;
      }
    }

    let updateDetected = 0;
    let updateApplied = 0;
    let pgUpserts = 0;
    let pgErrors = 0;
    let archiveDetected = 0;
    let archiveApplied = 0;

    for (const [id, apiTask] of Object.entries(apiTasksById)) {
      const dbItem = dbItemsById[id];
      if (!dbItem) continue;
      if (!apiTask.modifiedDateTime || !dbItem.ModifiedDateTime) continue;

      const apiSec = toEpochSeconds(apiTask.modifiedDateTime);
      const dbSec = toEpochSeconds(dbItem.ModifiedDateTime);

      if (apiSec > dbSec + TIME_TOLERANCE_SECONDS) {
        updateDetected++;
        console.log("UPDATE_DETECTED", { id });

        if (APPLY_UPDATES) {
          await applyUpdate(dbItem, apiTask);
          updateApplied++;
          console.log("UPDATE_APPLIED", { id });

          try {
            await persistFieldTask(apiTask);
            pgUpserts++;
            console.log("PG_UPDATE_APPLIED", { id });
          } catch (err) {
            pgErrors++;
            console.error("PG_UPDATE_FAILED", {
              id,
              message: err?.message,
            });
          }
        }
      }
    }

    for (const [id, dbItem] of Object.entries(dbItemsById)) {
      if (apiTasksById[id]) continue;

      archiveDetected++;
      console.log("ARCHIVE_DETECTED", { id });

      if (APPLY_UPDATES) {
        try {
          await applyArchive(dbItem);
          archiveApplied++;
          console.log("ARCHIVE_APPLIED", { id });
        } catch (err) {
          if (err.name === "ConditionalCheckFailedException") {
            console.log("ARCHIVE_SKIPPED_ALREADY_ARCHIVED", { id });
          } else {
            throw err;
          }
        }
      }
    }

    console.log("RUN_SUMMARY", {
      apiTaskCount: Object.keys(apiTasksById).length,
      dbTaskCount: Object.keys(dbItemsById).length,
      updatesDetected: updateDetected,
      updatesApplied: updateApplied,
      pgUpserts,
      pgErrors,
      archivesDetected: archiveDetected,
      archivesApplied: archiveApplied,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        applyUpdates: APPLY_UPDATES,
        apiTaskCount: Object.keys(apiTasksById).length,
        dbTaskCount: Object.keys(dbItemsById).length,
        updatesDetected: updateDetected,
        updatesApplied: updateApplied,
        pgUpserts,
        pgErrors,
        archivesDetected: archiveDetected,
        archivesApplied: archiveApplied,
      }),
    };
  } catch (err) {
    console.error("Reconciliation failure", err);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        message: err.message,
      }),
    };
  }
};
