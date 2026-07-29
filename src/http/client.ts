import axios from "axios";
import { env } from "../config/env";

export const client = axios.create({
  baseURL: env.CATALOGO_URL,
  headers: {
    "User-Agent": "PiagaCatalogSync/1.0",
    "Accept": "text/html,application/xhtml+xml,application/json",
  },
  withCredentials: true,
  timeout: 15000,
});