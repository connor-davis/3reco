const { Router } = require('express');
const router = Router();
const passport = require('passport');
const fs = require("fs");

const User = require('../../../models/user.model');
const generateUsersExcelSheet = require('../../utils/excel/generateUsersExcelSheet');

/**
 * @openapi
 * /api/v1/admin/export/users:
 *   get:
 *     description: Retrieve users excel data.
 *     tags: [Admin]
 *     produces:
 *       - application/json
 *     security:
 *       - Bearer: []
 *     responses:
 *       200:
 *         description: Returns users excel data.
 *       401:
 *         description: Returns "Unauthorized".
 */
router.get(
  '/',
  passport.authenticate('jwt', { session: false }),
  async (request, response) => {
    try {
      const users = await User.find();

      await generateUsersExcelSheet(users, (path, filename) => {
        response.set('Content-disposition', 'attachment; filename=' + filename);
        response.set(
          'Content-type',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64'
        );
        response.status(200).download(path);

        setTimeout(() => {
          fs.unlinkSync(path);
        }, 30000);
      });
    } catch (error) {
      return response
        .status(200)
        .json({ message: 'Failed to get users excel data.', error });
    }
  }
);

module.exports = router;
