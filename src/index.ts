import app from "./app";
import logger from "./logger";

const PORT = process.env.PORT ?? 3000;

app.listen(PORT, () => {
  logger.info(`Shadow App Scanner running on port ${PORT}`);
});
