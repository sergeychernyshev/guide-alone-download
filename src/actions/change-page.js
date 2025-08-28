const { getAuthenticatedClient } = require("../oauth");
const { getDriveClient, listFiles, findOrCreateFolder, FOLDER_NAME } = require("../drive-manager");
const { buildPhotoListHtml, buildPaginationHtml } = require("../utils/photo-utils");
const { filterPhotos } = require("../photo-manager");

async function changePage(req, ws, payload) {
  const { page, filters } = payload;
  const { allPhotos, search, status } = req.session;

  const oAuth2Client = await getAuthenticatedClient(req);
  const drive = await getDriveClient(oAuth2Client);
  const folder = await findOrCreateFolder(drive, FOLDER_NAME);
  const driveFiles = await listFiles(drive, folder.id);
  const downloadedFiles = new Set(driveFiles.map((f) => f.name));

  const filteredPhotos = filterPhotos(allPhotos, { search, status, filters, downloadedFiles });

  const pageSize = 50;
  const totalPages = Math.ceil(filteredPhotos.length / pageSize);
  const paginatedPhotos = filteredPhotos.slice(
    (page - 1) * pageSize,
    page * pageSize
  );

  const photoListHtml = buildPhotoListHtml(paginatedPhotos, downloadedFiles);
  const paginationHtml = buildPaginationHtml(totalPages, page, 'changePage');

  ws.send(
    JSON.stringify({
      type: "page-changed",
      payload: {
        photoListHtml,
        paginationHtml,
      },
    })
  );
}

module.exports = { changePage };
