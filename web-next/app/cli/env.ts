import dotenv from "dotenv";
import path from "node:path";

// This side-effect module must run before command modules resolve the database path.
dotenv.config({ path: path.resolve(__dirname, "../../.env.local"), quiet: true });
