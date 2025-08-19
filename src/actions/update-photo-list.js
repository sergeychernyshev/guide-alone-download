const { getAuthenticatedClient } = require("../oauth");
const { listAllPhotos } = require("../photo-manager");
const {
  getDriveClient,
  findOrCreateFolder,
  getPhotoListFile,
  writeFileContent,
  FOLDER_NAME,
  PHOTO_LIST_FILE_NAME,
} = require("../drive-manager");
const { updateState } = require("../download-state");

/**
 * Updates the list of photos from Google Street View and saves it to Google Drive.
 * @param {object} req - The Express request object, containing the session.
 */
async function updatePhotoList(req) {
  /**
   * Sends progress updates to the client.
   * @param {object} progress - The progress object.
   */
  const progressCallback = (progress) => {
    updateState(progress);
  };

  try {
    // Get authenticated clients for Google Drive and Street View
    const oAuth2Client = await getAuthenticatedClient(req);
    const drive = await getDriveClient(oAuth2Client);

    // Find or create the folder in Google Drive
    const folder = await findOrCreateFolder(drive, FOLDER_NAME);
    const folderId = folder.id;

    // Get the existing photo list file, if it exists
    let photoListFile = await getPhotoListFile(drive, folderId);

    // List all photos from Google Street View
    const photos = await listAllPhotos(oAuth2Client, progressCallback);

    // If the photo list file exists, update it. Otherwise, create a new file.
    if (photoListFile) {
      await writeFileContent(drive, photoListFile.id, photos);
    } else {
      await drive.files.create({
        resource: {
          name: PHOTO_LIST_FILE_NAME,
          parents: [folderId],
        },
        media: {
          mimeType: "application/json",
          body: JSON.stringify(photos, null, 2),
        },
        fields: "id",
      });
    }
  } catch (error) {
    // Handle errors
    progressCallback({
      error: `An error occurred: ${error.message}`,
      complete: true,
      inProgress: false,
    });
    console.error(error);
  }
}

module.exports = { updatePhotoList };
