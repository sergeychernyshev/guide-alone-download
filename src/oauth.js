const { google } = require("googleapis");
const fs = require("fs").promises;
const path = require("path");

const CREDENTIALS_PATH = path.join(process.cwd(), "credentials.json");
const TOKEN_PATH = path.join(process.cwd(), "token.json");
const CONFIG_PATH = path.join(process.cwd(), "config.json");

async function getOAuthClient() {
  const credsContent = await fs.readFile(CREDENTIALS_PATH);
  const { client_secret, client_id, redirect_uris } =
    JSON.parse(credsContent).web;
  return new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
}

async function getAuthenticatedClient(req) {
  const oAuth2Client = await getOAuthClient();
  let tokens = req.session.tokens;

  if (!tokens) {
    let config = {};
    try {
      const configData = await fs.readFile(CONFIG_PATH, "utf-8");
      config = JSON.parse(configData);
    } catch (error) {
      /* ignore */
    }

    if (config.save_token) {
      try {
        const tokenData = await fs.readFile(TOKEN_PATH, "utf-8");
        tokens = JSON.parse(tokenData);
        req.session.tokens = tokens;
        console.log("Loaded token from disk into session.");
      } catch (error) {
        /* ignore */
      }
    }
  }

  if (tokens) {
    oAuth2Client.setCredentials(tokens);
  } else {
    throw new Error("User is not authenticated.");
  }

  return oAuth2Client;
}

function isLoggedIn(req) {
  return req.session && req.session.tokens;
}

async function login(req, code) {
  const oAuth2Client = await getOAuthClient();
  const { tokens } = await oAuth2Client.getToken(code);
  req.session.tokens = tokens;

  const configData = await fs.readFile(CONFIG_PATH, "utf-8").catch(() => "{}");
  const config = JSON.parse(configData);
  if (config.save_token) {
    await fs.writeFile(TOKEN_PATH, JSON.stringify(tokens, null, 2));
    console.log("Saved token to disk.");
  }
}

function logout(req, callback) {
  req.session.destroy(async () => {
    await fs.unlink(TOKEN_PATH).catch((err) => {
      if (err.code !== "ENOENT") {
        console.error("Error deleting token file:", err);
      }
    });
    console.log("Deleted token from disk.");
    callback();
  });
}

async function isTokenValid(token) {
  if (!token) {
    return false;
  }
  try {
    const oAuth2Client = await getOAuthClient();
    oAuth2Client.setCredentials(token);
    // Make a simple API call to check if the token is valid.
    const tokenInfo = await oAuth2Client.getTokenInfo(token.access_token);
    return !!tokenInfo;
  } catch (error) {
    return false;
  }
}

module.exports = {
  getOAuthClient,
  getAuthenticatedClient,
  isLoggedIn,
  isTokenValid,
  login,
  logout,
};
