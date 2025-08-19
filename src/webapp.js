const express = require("express");
const session = require("express-session");
const path = require("path");
const fs = require("fs").promises;
const crypto = require("crypto");
const http = require("http");
const WebSocket = require("ws");

const indexRouter = require("./routes/index");

const { isTokenValid } = require("./oauth");
const { handleMessage } = require("./ws-handler");
const { setSocket } = require("./download-state");

// --- CONFIGURATION ---
const PORT = 3000;
const CREDENTIALS_PATH = path.join(process.cwd(), "credentials.json");
const TOKEN_PATH = path.join(process.cwd(), "token.json");
const CONFIG_PATH = path.join(process.cwd(), "config.json");

// --- WEB APP SETUP ---
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true });

server.on('upgrade', function upgrade(request, socket, head) {
  sessionParser(request, {}, () => {
    wss.handleUpgrade(request, socket, head, function done(ws) {
      wss.emit('connection', ws, request);
    });
  });
});

wss.on("connection", (ws, req) => {
  console.log("Client connected for progress updates");
  setSocket(ws);
  ws.on("message", (message) => {
    handleMessage(req, ws, message);
  });
  ws.on("close", () => {
    console.log("Client disconnected");
    setSocket(null);
  });
});

const MemoryStore = require("memorystore")(session);
const store = new MemoryStore({
  checkPeriod: 86400000, // prune expired entries every 24h
});

const sessionParser = session({
  store: store,
  secret: crypto.randomBytes(32).toString("hex"),
  resave: false,
  saveUninitialized: false,
});

// Set up EJS
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

async function initialize() {
  let config = {};
  try {
    const configData = await fs.readFile(CONFIG_PATH, "utf-8");
    config = JSON.parse(configData);
  } catch (error) {
    console.log("config.json not found, using default settings.");
  }

  app.use(sessionParser);

  if (config.save_token) {
    try {
      const tokenData = await fs.readFile(TOKEN_PATH, "utf-8");
      const token = JSON.parse(tokenData);
      if (await isTokenValid(token)) {
        console.log("Valid token found, logging user in.");
        // Manually create a session for the user
        app.use((req, res, next) => {
          if (!req.session.tokens) {
            req.session.tokens = token;
          }
          next();
        });
      } else {
        console.log("Invalid token found, deleting.");
        await fs.unlink(TOKEN_PATH);
      }
    } catch (error) {
      console.log("Token file not found, starting fresh.");
    }
  }

  // Middleware to save the token to disk if the config option is set
  app.use(async (req, res, next) => {
    let config = {};
    try {
      const configData = await fs.readFile(CONFIG_PATH, "utf-8");
      config = JSON.parse(configData);
    } catch (error) {
      // ignore
    }

    if (config.save_token) {
      const oldTokens = req.session.tokens;
      res.on("finish", async () => {
        if (
          req.session &&
          req.session.tokens &&
          req.session.tokens !== oldTokens
        ) {
          await fs.writeFile(
            TOKEN_PATH,
            JSON.stringify(req.session.tokens, null, 2)
          );
          console.log("Saved token to disk.");
        }
      });
    }
    next();
  });

  // --- WEB INTERFACE & ROUTES ---
  app.use("/", indexRouter);

  /**
   * Global error handler for the Express app.
   */
  app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send(`Something broke! <pre>${err.stack}</pre>`);
  });

  /**
   * Starts the web server.
   */
  async function startServer() {
    try {
      // Check if credentials file exists before starting
      await fs.access(CREDENTIALS_PATH);
      server.listen(PORT, () => {
        console.log(`\n✅ Server running at http://localhost:${PORT}`);
        console.log("   Open this URL in your browser to start.");
      });
    } catch (error) {
      console.error("❌ FATAL ERROR: `credentials.json` not found.");
      console.error(
        "   Please ensure the credentials file from Google Cloud is in the project directory."
      );
      process.exit(1);
    }
  }
  startServer();
}

initialize();
