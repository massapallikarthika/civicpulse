import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { HttpError } from "./lib/supabase";

const app: Express = express();

app.set("trust proxy", 1);
app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use((req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    next();
    return;
  }

  const origin = req.get("origin");
  const host = req.get("host");
  
  const allowedOrigins = process.env.FRONTEND_URL
  ? [process.env.FRONTEND_URL]
  : [];

  if (origin && host) {
    try {
      const originHost = new URL(origin).host;

      if (originHost !== host && !allowedOrigins.includes(origin)) {
        res.status(403).json({ error: "Cross-origin requests are not allowed." });
        return;
      }
    } catch {
      res.status(403).json({ error: "Invalid request origin." });
      return;
    }
  }

  next();
});

app.use("/api", router);

app.use((error: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (res.headersSent) {
    next(error);
    return;
  }
  const known = error instanceof HttpError ? error : null;
  req.log.error(
    { err: error, code: known?.code, status: known?.status ?? 500 },
    "CivicPulse API request failed",
  );
  const status = known?.status ?? 500;
  res.status(status).json({
    error: known?.message ?? "The request could not be completed.",
    ...(known?.code ? { code: known.code } : {}),
  });
});

export default app;
