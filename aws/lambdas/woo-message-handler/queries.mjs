import { DynamoDBClient, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { persistFieldTask } from "./persistFieldTask.mjs";

const client = new DynamoDBClient({});

const UTC_DATE_KEYS = new Set([
  "AfterDateTime",
  "BeforeDateTime",
  "CreatedDateTime",
  "ModifiedDateTime",
]);

function normalizeUtc(value) {
  if (typeof value !== "string") return value;
  if (value.endsWith("Z")) return value;
  if (/[+-]\d{2}:\d{2}$/.test(value)) return value;
  return `${value}Z`;
}

function toAttributeValue(key, value) {
  if (value === null || value === undefined) return undefined;

  if (typeof value === "string") {
    if (UTC_DATE_KEYS.has(key)) {
      return { S: normalizeUtc(value) };
    }
    return { S: value };
  }

  if (typeof value === "number") return { N: value.toString() };
  if (typeof value === "boolean") return { BOOL: value };

  return { S: JSON.stringify(value) };
}

function buildUpdate(data, state) {
  const now = new Date().toISOString();

  const externalKey =
    data.ExternalKey && String(data.ExternalKey).trim() !== ""
      ? String(data.ExternalKey)
      : "N/A";

  const expressionNames = {
    "#PK": "PK",
    "#ModifiedDateTime": "ModifiedDateTime",
  };

  const expressionValues = {
    ":entry": {
      L: [{ M: { state: { S: state }, timestamp: { S: now } } }],
    },
    ":empty": { L: [] },
    ":zero": { N: "0" },
    ":one": { N: "1" },
    ":pk": { S: "TASK" },
  };

  let updateExpression = `
		SET PK = if_not_exists(#PK, :pk),
		    stateHistory = list_append(if_not_exists(stateHistory, :empty), :entry),
		    stateHistoryCount = if_not_exists(stateHistoryCount, :zero) + :one
	`;

  for (const [key, value] of Object.entries(data)) {
    if (key === "Id" || key === "ExternalKey") continue;

    const attr = toAttributeValue(key, value);
    if (!attr) continue;

    const nameKey = `#${key}`;
    const valueKey = `:${key}`;

    expressionNames[nameKey] = key;
    expressionValues[valueKey] = attr;
    updateExpression += `, ${nameKey} = ${valueKey}`;
  }

  return {
    TableName: "WOO-tasks",
    Key: {
      id: { S: String(data.Id) },
      externalKey: { S: externalKey },
    },
    UpdateExpression: updateExpression,
    ExpressionAttributeNames: expressionNames,
    ExpressionAttributeValues: expressionValues,
    ConditionExpression: `
			attribute_not_exists(#ModifiedDateTime)
			OR #ModifiedDateTime <= :ModifiedDateTime
		`,
  };
}

export async function persistTask(data, state) {
  const params = buildUpdate(data, state);
  try {
    await client.send(new UpdateItemCommand(params));
  } catch (err) {
    if (err?.name === "ConditionalCheckFailedException") {
      console.log("DDB_SKIP_STALE", { id: data?.Id, state });
    } else {
      throw err;
    }
  }

  try {
    await persistFieldTask(data, { webhookState: state });
  } catch (err) {
    console.error("PG_UPSERT_FAILED", {
      id: data?.Id,
      state,
      message: err?.message,
      stack: err?.stack,
    });
    // Dynamo already wrote (or was stale); surface PG failure so retries can heal Postgres.
    throw err;
  }

  return {
    statusCode: 200,
  };
}
