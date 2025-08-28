const { getAuthenticatedClient } = require("../oauth");
const { getDriveClient, listFiles, findOrCreateFolder, FOLDER_NAME } = require("../drive-manager");
const { buildPhotoListHtml, buildPaginationHtml } = require("../utils/photo-utils");
const photoManager = require('../photo-manager');

async function filterPhotos(req, ws, payload) {
  const { status, page } = payload;
  photoManager.setStatus(status);

  const { allPhotos, search } = req.session;

  const filteredByStatusPhotos = photoManager.filterPhotos(allPhotos, status);
  const filteredPhotos = photoManager.searchPhotos(filteredByStatusPhotos, search);

  const photos = filteredPhotos;
  const pageSize = 50;
  const totalPages = Math.ceil(photos.length / pageSize);
  const currentPage = page || 1;
  const paginatedPhotos = photos.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const oAuth2Client = await getAuthenticatedClient(req);
  const drive = await getDriveClient(oAuth2Client);
  const folder = await findOrCreateFolder(drive, FOLDER_NAME);
  const driveFiles = await listFiles(drive, folder.id);
  const downloadedFiles = new Set(driveFiles.map((f) => f.name));

  const photoListHtml = buildPhotoListHtml(paginatedPhotos, downloadedFiles);
  const paginationHtml = buildPaginationHtml(totalPages, currentPage, 'changePage');

  ws.send(
    JSON.stringify({
      type: "filter-results",
      payload: {
        photoListHtml,
        paginationHtml,
        newCurrentPage: currentPage,
      },
    })
  );
}

module.exports = { filterPhotos };