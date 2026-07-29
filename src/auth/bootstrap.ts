import { client } from "../http/client";
import { logger } from "../utils/logger";

export async function bootstrap() {
  const response = await client.get("");

  logger.info(`Status: ${response.status}`);

  console.log(response.data);
}