const { google } = require("googleapis");
const express = require("express");
const session = require("express-session");
const path = require("path");
const fs = require("fs").promises;
const fs_stream = require("fs");
const axios = require("axios");
const crypto = require("crypto");

// --- CONFIGURATION ---
const PORT = 3000;
const SCOPES = ["https://www.googleapis.com/auth/streetviewpublish"];
const CREDENTIALS_PATH = path.join(process.cwd(), "credentials.json");
const PHOTO_LIST_CACHE_PATH = path.join(
  process.cwd(),
  "streetview_photos.json"
);
const DOWNLOAD_DIR = path.join(process.cwd(), "streetview_photos");

// --- WEB APP SETUP ---
const app = express();

// Session middleware to store the OAuth tokens.
// Replace 'supersecretkey' with a real secret in a production environment.
app.use(
  session({
    secret: crypto.randomBytes(32).toString("hex"),
    resave: false,
    saveUninitialized: false,
  })
);

/**
 * A helper function to create an OAuth2 client.
 * It will be used for generating the auth URL and for API calls.
 */
async function getOAuthClient() {
  const credsContent = await fs.readFile(CREDENTIALS_PATH);
  const { client_secret, client_id, redirect_uris } =
    JSON.parse(credsContent).web;
  return new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
}

// --- WEB INTERFACE & ROUTES ---

/**
 * Root route. Displays a login link or a download button.
 */
app.get("/", (req, res) => {
  const isLoggedIn = !!req.session.tokens;
  res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Google Street View Downloader</title>
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; padding: 2em; max-width: 800px; margin: auto; background: #f7f7f7; }
                .container { background: white; padding: 2em; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
                h1 { color: #333; }
                a, button { display: inline-block; text-decoration: none; background: #4285F4; color: white; padding: 10px 20px; border-radius: 5px; border: none; cursor: pointer; font-size: 16px; }
                a.logout { background: #db4437; }
                pre { background: #2d2d2d; color: #f1f1f1; padding: 1em; border-radius: 5px; white-space: pre-wrap; word-wrap: break-word; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>Google Street View Photo Downloader</h1>
                ${
                  isLoggedIn
                    ? `
                    <p>You are logged in. Click the button below to view your photo list.</p>
                    <button onclick="window.location.href='/list'">View/Fetch Photo List</button>
                    <a href="/logout" class="logout">Logout</a>
                `
                    : `
                    <p>Please log in with your Google account to begin.</p>
                    <a href="/login">Login with Google</a>
                `
                }
            </div>
        </body>
        </html>
    `);
});

/**
 * Login route. Redirects the user to Google's consent screen.
 */
app.get("/login", async (req, res, next) => {
  try {
    const oAuth2Client = await getOAuthClient();
    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: "offline",
      scope: SCOPES,
      prompt: "consent",
    });
    res.redirect(authUrl);
  } catch (error) {
    next(error);
  }
});

/**
 * Logout route. Clears the session.
 */
app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/");
  });
});

/**
 * OAuth2 callback route. Google redirects here after user consent.
 * It exchanges the code for tokens and saves them in the session.
 */
app.get("/oauth2callback", async (req, res, next) => {
  const { code } = req.query;
  if (!code) {
    return res.status(400).send("Authorization code is missing.");
  }
  try {
    const oAuth2Client = await getOAuthClient();
    const { tokens } = await oAuth2Client.getToken(code);
    req.session.tokens = tokens; // Save tokens in the session
    res.redirect("/");
  } catch (error) {
    next(error);
  }
});

/**
 * Fetches the list of photos from the API, saves it to a local cache,
 * and then redirects to the /list page.
 */
app.get("/list/update", async (req, res, next) => {
  if (!req.session.tokens) {
    return res.redirect("/login");
  }

  try {
    const oAuth2Client = await getOAuthClient();
    oAuth2Client.setCredentials(req.session.tokens);

    console.log("Force updating photo list from API...");
    const photos = await listAllPhotos(oAuth2Client, console.log);
    await fs.writeFile(PHOTO_LIST_CACHE_PATH, JSON.stringify(photos, null, 2));
    console.log(`Saved ${photos.length} photos to cache.`);

    res.redirect("/list");
  } catch (error) {
    next(error);
  }
});

/**
 * Fetches the list of photos and displays a confirmation page.
 */
app.get("/list", async (req, res, next) => {
  if (!req.session.tokens) {
    return res.redirect("/login");
  }
  try {
    let photos;
    // Try to read from cache first
    try {
      const cachedData = await fs.readFile(PHOTO_LIST_CACHE_PATH, "utf-8");
      photos = JSON.parse(cachedData);
      console.log(`Loaded ${photos.length} photos from cache.`);
    } catch (error) {
      // If cache doesn't exist or is invalid, fetch from API
      console.log(
        "Cache not found or invalid. Fetching photo list from API..."
      );
      const oAuth2Client = await getOAuthClient();
      oAuth2Client.setCredentials(req.session.tokens);
      photos = await listAllPhotos(oAuth2Client); // No streaming log here
      await fs.writeFile(
        PHOTO_LIST_CACHE_PATH,
        JSON.stringify(photos, null, 2)
      );
      console.log(`Saved ${photos.length} photos to cache.`);
    }
    req.session.photos = photos; // Store photos in session for the download step

    // Sorting
    const sortBy = req.query.sort || "date"; // Default sort by date
    const sortOrder = req.query.order || "desc"; // Default order descending

    photos.sort((a, b) => {
      let valA, valB;

      if (sortBy === "views") {
        valA = parseInt(a.viewCount, 10) || 0;
        valB = parseInt(b.viewCount, 10) || 0;
      } else {
        // Default to date
        valA = new Date(a.captureTime).getTime();
        valB = new Date(b.captureTime).getTime();
      }

      if (sortOrder === "asc") {
        return valA - valB;
      } else {
        return valB - valA;
      }
    });

    // Check for already downloaded files
    const downloadedFiles = new Set();
    try {
      const files = await fs.readdir(DOWNLOAD_DIR);
      files.forEach((file) => downloadedFiles.add(file));
    } catch (err) {
      // It's okay if the directory doesn't exist yet.
      console.log(
        "Download directory not found. Assuming no files are downloaded."
      );
    }

    // Pagination
    const page = parseInt(req.query.page, 10) || 1;
    const pageSize = 50;
    const totalPhotos = photos.length;
    const totalPages = Math.ceil(totalPhotos / pageSize);
    const paginatedPhotos = photos.slice(
      (page - 1) * pageSize,
      page * pageSize
    );

    console.log(
      `Displaying page ${page} of ${totalPages} (${totalPhotos} total photos).`
    );

    const photoListHtml = paginatedPhotos
      .map((photo) => {
        const photoId = photo.photoId.id;
        const isDownloaded = downloadedFiles.has(`${photoId}.jpg`);
        const placeName =
          photo.places && photo.places.length > 0
            ? photo.places[0].name
            : "N/A";
        const captureTime = new Date(photo.captureTime).toLocaleDateString();
        const viewCount = photo.viewCount || 0;
        const status = isDownloaded
          ? '<span class="status downloaded">Downloaded</span>'
          : '<span class="status not-downloaded">Not Downloaded</span>';

        return `
          <tr>
            <td>${photoId}</td>
            <td>${placeName}</td>
            <td>${captureTime}</td>
            <td>${viewCount}</td>
            <td>${status}</td>
          </tr>
        `;
      })
      .join("");

    let paginationHtml = '<div class="pagination">';
    const baseParams = `sort=${sortBy}&order=${sortOrder}`;
    if (page > 1) {
      paginationHtml += `<a href="/list?page=${
        page - 1
      }&${baseParams}">&laquo; Previous</a>`;
    }
    if (totalPages > 1) {
      paginationHtml += `<span> Page ${page} of ${totalPages} </span>`;
    }
    if (page < totalPages) {
      paginationHtml += `<a href="/list?page=${
        page + 1
      }&${baseParams}">Next &raquo;</a>`;
    }
    paginationHtml += "</div>";

    const buildSortLink = (column, text) => {
      const isCurrentSort = sortBy === column;
      const newOrder = isCurrentSort && sortOrder === "asc" ? "desc" : "asc";
      const arrow = isCurrentSort
        ? sortOrder === "asc"
          ? " &uarr;"
          : " &darr;"
        : "";
      return `<a href="/list?sort=${column}&order=${newOrder}">${text}${arrow}</a>`;
    };

    res.send(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Photo List</title>
                <style>
                    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; padding: 2em; max-width: 1000px; margin: auto; background: #f7f7f7; }
                    .container { background: white; padding: 2em; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
                    h1 { color: #333; }
                    a, button { display: inline-block; text-decoration: none; background: #4285F4; color: white; padding: 10px 20px; border-radius: 5px; border: none; cursor: pointer; font-size: 16px; margin-right: 10px; }
                    a.cancel { background: #6c757d; }
                    .update-btn { background: #34A853; }
                    table { width: 100%; border-collapse: collapse; margin-top: 1.5em; margin-bottom: 1.5em; table-layout: fixed; }
                    th, td { text-align: left; padding: 10px; border-bottom: 1px solid #ddd; font-size: 14px; }
                    th { background-color: #f2f2f2; }
                    td:first-child { font-family: monospace; font-size: 12px; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
                    .status { padding: 4px 10px; border-radius: 12px; font-size: 12px; color: white; font-weight: 500; }
                    .status.downloaded { background-color: #34A853; }
                    .status.not-downloaded { background-color: #EA4335; }
                    .pagination { margin-top: 1em; text-align: center; }
                    .pagination a, .pagination span { color: #4285F4; padding: 8px 16px; text-decoration: none; background: white; border: 1px solid #ddd; margin: 0 2px; }
                    .pagination a:hover { background-color: #f1f1f1; }
                    .pagination span { border: 1px solid transparent; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>${totalPhotos} Photos Found</h1>
                    ${
                      totalPhotos > 0
                        ? `
                        <p>This is a list of your photos. It indicates which ones have already been downloaded to the <code>streetview_photos</code> directory.</p>
                        <button onclick="window.location.href='/download'">Download All Missing Photos</button>
                        <button onclick="window.location.href='/list/update'" class="update-btn">Update List from Google</button>
                        <a href="/" class="cancel">Cancel</a>
                        <table><thead><tr>
                          <th style="width: 30%;">Photo ID</th>
                          <th style="width: 25%;">Place Name</th>
                          <th style="width: 15%;">${buildSortLink(
                            "date",
                            "Capture Time"
                          )}</th>
                          <th style="width: 15%;">${buildSortLink(
                            "views",
                            "View Count"
                          )}</th>
                          <th style="width: 15%;">Status</th>
                        </tr></thead>
                        <tbody>${photoListHtml}</tbody></table>
                        ${paginationHtml}
                    `
                        : `
                        <p>You do not have any photos uploaded to Google Street View.</p>
                        <button onclick="window.location.href='/list/update'" class="update-btn">Check for new photos</button>
                        <a href="/">Go Back</a>
                    `
                    }
                </div>
            </body>
            </html>
        `);
  } catch (error) {
    next(error);
  }
});

/**
 * Download route. This is where the main logic runs.
 * It streams the log output to the browser.
 */
app.get("/download", async (req, res, next) => {
  if (!req.session.tokens) {
    return res.redirect("/login");
  }

  if (!req.session.photos) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res
      .status(400)
      .send(
        'Photo list not found in session. Please <a href="/list">fetch the list</a> first.'
      );
  }

  // Set headers for a streaming response
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Transfer-Encoding", "chunked");

  // A logging function that writes directly to the HTTP response stream
  const log = (message) => {
    console.log(message); // Also log to console
    res.write(message + "\n");
  };

  try {
    const oAuth2Client = await getOAuthClient();
    oAuth2Client.setCredentials(req.session.tokens);

    await fs.mkdir(DOWNLOAD_DIR, { recursive: true });
    log(`Photos will be saved to: ${DOWNLOAD_DIR}`);

    const photos = req.session.photos;

    if (photos.length === 0) {
      log("No photos found for this user.");
      return res.end("\n✅ Process finished.");
    }

    log(`\nStarting download of ${photos.length} photos...`);
    for (const photo of photos) {
      await downloadPhoto(photo, log);
    }

    // Clean up session after download is complete
    delete req.session.photos;

    log("\n✅ All photos downloaded successfully!");
    res.end();
  } catch (error) {
    log(`\n❌ An error occurred: ${error.message}`);
    if (error.code === 401 || error.message.includes("invalid_grant")) {
      log(
        "Authentication error. Your session may have expired. Please log out and log back in."
      );
      // Clear the bad tokens
      req.session.destroy();
    }
    console.error(error);
    res.end("\nProcess failed.");
  }
});

// --- API & DOWNLOAD LOGIC (Refactored from original script) ---

/**
 * Lists all photos for the authenticated user, handling pagination.
 * @param {import('google-auth-library').OAuth2Client} authClient An authorized OAuth2 client.
 * @param {(message: string) => void} [log=() => {}] An optional function to log progress messages.
 */
async function listAllPhotos(authClient, log = () => {}) {
  const streetviewpublish = google.streetviewpublish({
    version: "v1",
    auth: authClient,
  });
  const allPhotos = [];
  let nextPageToken = null;

  log("\nFetching list of all your 360 photos from Google Maps...");

  do {
    const res = await streetviewpublish.photos.list({
      view: "INCLUDE_DOWNLOAD_URL",
      pageSize: 100,
      pageToken: nextPageToken,
    });

    if (res.data.photos && res.data.photos.length > 0) {
      allPhotos.push(...res.data.photos);
      log(`... found ${allPhotos.length} photos so far.`);
    }
    nextPageToken = res.data.nextPageToken;
  } while (nextPageToken);

  log(`\nTotal photos found: ${allPhotos.length}.`);
  return allPhotos;
}

/**
 * Downloads a single photo to the download directory.
 * @param {object} photo The photo metadata object from the API.
 * @param {(message: string) => void} log A function to log progress messages.
 */
async function downloadPhoto(photo, log) {
  if (!photo.downloadUrl) {
    log(
      `- WARNING: Photo ${photo.photoId.id} does not have a download URL. Skipping.`
    );
    return;
  }

  const photoUrl = photo.downloadUrl;
  const photoId = photo.photoId.id;
  const filePath = path.join(DOWNLOAD_DIR, `${photoId}.jpg`);

  try {
    await fs.access(filePath);
    log(`- Photo ${photoId}.jpg already exists. Skipping.`);
    return;
  } catch (error) {
    // File doesn't exist, so proceed with download.
  }

  log(`- Downloading ${photoId}.jpg...`);

  try {
    const response = await axios({
      method: "GET",
      url: photoUrl,
      responseType: "stream",
    });

    const writer = fs_stream.createWriteStream(filePath);
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on("finish", resolve);
      writer.on("error", (err) => {
        log(`  Error writing file for photo ${photoId}.`);
        reject(err);
      });
      response.data.on("error", (err) => {
        log(`  Error in download stream for photo ${photoId}.`);
        reject(err);
      });
    });
  } catch (error) {
    log(`  Failed to download photo ${photoId}: ${error.message}`);
  }
}

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
    app.listen(PORT, () => {
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
