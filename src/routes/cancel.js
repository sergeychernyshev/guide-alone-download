const express = require("express");
const { updateState, resetState } = require("../download-state");

const router = express.Router();

router.post("/", (req, res) => {
  updateState({ cancelled: true, inProgress: false });
  res.sendStatus(200);
});

module.exports = router;
