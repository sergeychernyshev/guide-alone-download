const { google } = require("googleapis");

const FOLDER_NAME = "Google Street View Photos";
const PHOTO_LIST_FILE_NAME = "streetview_photos.json";

async function getDriveClient(auth) {
  return google.drive({ version: "v3", auth });
}

async function findFolder(drive, folderName) {
  const res = await drive.files.list({
    q: `mimeType='application/vnd.google-apps.folder' and name='${folderName}' and trashed=false`,
    fields: "files(id, name, webViewLink)",
    spaces: "drive",
  });
  return res.data.files.length > 0 ? res.data.files[0] : null;
}

async function createFolder(drive, folderName) {
  const fileMetadata = {
    name: folderName,
    mimeType: "application/vnd.google-apps.folder",
  };
  const res = await drive.files.create({
    resource: fileMetadata,
    fields: "id, webViewLink",
  });
  return res.data;
}

async function findOrCreateFolder(drive, folderName) {
  let folder = await findFolder(drive, folderName);
  if (!folder) {
    folder = await createFolder(drive, folderName);
  }
  return folder;
}

async function findFileInFolder(drive, fileName, folderId) {
  const res = await drive.files.list({
    q: `name='${fileName}' and '${folderId}' in parents and trashed=false`,
    fields: "files(id, name)",
    spaces: "drive",
  });
  return res.data.files.length > 0 ? res.data.files[0] : null;
}

async function getPhotoListFile(drive, folderId) {
  return findFileInFolder(drive, PHOTO_LIST_FILE_NAME, folderId);
}

async function readFileContent(drive, fileId) {
  const res = await drive.files.get({ fileId, alt: "media" });
  return res.data;
}

async function writeFileContent(drive, fileId, content) {
  await drive.files.update({
    fileId,
    media: {
      mimeType: "application/json",
      body: JSON.stringify(content, null, 2),
    },
  });
}

const { PassThrough } = require("stream");

async function createFile(
  drive,
  fileName,
  mimeType,
  contentStream,
  folderId,
  size,
  onUploadProgress
) {
  const fileMetadata = {
    name: fileName,
    parents: [folderId],
  };

  const passThrough = new PassThrough();
  let bytesUploaded = 0;

  passThrough.on("data", (chunk) => {
    bytesUploaded += chunk.length;
    if (size) {
      const percentage = Math.round((bytesUploaded / size) * 100);
      onUploadProgress(percentage);
    }
  });

  contentStream.pipe(passThrough);

  const media = {
    mimeType,
    body: passThrough,
  };
  await drive.files.create({
    resource: fileMetadata,
    media: media,
    fields: "id",
  });
}

async function listFiles(drive, folderId) {
  const allFiles = [];
  let pageToken = null;
  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed=false and mimeType != 'application/vnd.google-apps.folder'`,
      fields: "nextPageToken, files(id, name, mimeType, webViewLink)",
      spaces: "drive",
      pageToken: pageToken,
      pageSize: 1000,
    });

    for (const file of res.data.files) {
      allFiles.push(file);
    }
    pageToken = res.data.nextPageToken;
  } while (pageToken);
  return allFiles;
}

async function deleteFile(drive, fileId) {
  await drive.files.delete({
    fileId: fileId,
  });
}

module.exports = {
  getDriveClient,
  findOrCreateFolder,
  getPhotoListFile,
  readFileContent,
  writeFileContent,
  createFile,
  listFiles,
  deleteFile,
  FOLDER_NAME,
  PHOTO_LIST_FILE_NAME,
};