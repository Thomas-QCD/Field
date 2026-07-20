import { persistTask } from "./queries.mjs";

export const handler = async (event) => {
  const path = event.pathParameters?.endpoint;
  const data = event.body ? JSON.parse(event.body) : null;
  console.log(path, data);
  switch (path) {
    case "create-task":
      return await persistTask(data, "Created");

    case "driver-assigned":
      return await persistTask(data, "Driver assigned");

    case "task-processed":
      return await persistTask(data, "Processed");

    case "package-loaded-picked-up":
      return await persistTask(data, "Package loaded/picked up");

    case "task-started":
      return await persistTask(data, "Started");

    case "driver-arrived":
      return await persistTask(data, "Driver arrived");

    case "task-completed":
      return await persistTask(data, "Completed");

    case "task-failed":
      return await persistTask(data, "Failed");

    case "task-cancelled":
      return await persistTask(data, "Cancelled");

    default:
      console.error("No handler");
      return {
        statusCode: 404,
        body: JSON.stringify({ message: "Unknown endpoint" }),
      };
  }
};
