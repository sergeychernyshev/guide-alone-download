const express = require("express");
const { getAuthenticatedClient, isLoggedIn } = require("../oauth");
const { getDriveClient, deleteFile } = require("../drive-manager");

const router = express.Router();

router.post("/", express.json(), async (req, res, next) => {
  if (!isLoggedIn(req)) {
    return res.status(401).send("You must be logged in to delete files.");
  }

  const { fileIds } = req.body;

  if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
    return res.status(400).send("No file IDs provided.");
  }

  try {
    const oAuth2Client = await getAuthenticatedClient(req);
    const drive = await getDriveClient(oAuth2Client);

    for (const fileId of fileIds) {
      await deleteFile(drive, fileId);
    }

    res.redirect("/");
  } catch (error) {
    next(error);
  }
});

module.exports = router;
