const express = require("express");
const { getAuthenticatedClient, isLoggedIn } = require("../oauth");
const { getDriveClient, findFile, FOLDER_NAME, findOrCreateFolder } = require("../drive-manager");

const router = express.Router();

router.get("/:photoId", async (req, res, next) => {
  if (!isLoggedIn(req)) {
    return res.status(401).send("You must be logged in to download photos.");
  }

  try {
    const { photoId } = req.params;
    const oAuth2Client = await getAuthenticatedClient(req);
    const drive = await getDriveClient(oAuth2Client);
    const folder = await findOrCreateFolder(drive, FOLDER_NAME);
    const folderId = folder.id;
    const fileName = `${photoId}.jpg`;
    const file = await findFile(drive, fileName, folderId);

    if (!file) {
      return res.status(404).send("File not found.");
    }

    drive.files.get(
      { fileId: file.id, alt: "media" },
      { responseType: "stream" },
      (err, { data }) => {
        if (err) {
          return next(err);
        }
        res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
        data.pipe(res);
      }
    );
  } catch (error) {
    next(error);
  }
});

module.exports = router;
