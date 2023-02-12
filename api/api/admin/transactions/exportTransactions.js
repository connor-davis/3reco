const { Router } = require('express');
const router = Router();
const passport = require('passport');
const fs = require('fs');

const Transaction = require('../../../models/transaction.model');
const generateUserTransactionsExcelSheet = require('../../utils/excel/generateUserTransactionsExcelSheet.js');

/**
 * @openapi
 * /api/v1/admin/export/transactions:
 *   get:
 *     description: Retrieve transactions excel data for all users.
 *     tags: [Admin]
 *     produces:
 *       - application/json
 *     security:
 *       - Bearer: []
 *     responses:
 *       200:
 *         description: Returns transactions excel data for all users.
 *       401:
 *         description: Returns "Unauthorized".
 */
router.get(
  '/',
  passport.authenticate('jwt', { session: false }),
  async (request, response) => {
    try {
      const transactions = await Transaction.find().sort({ date: -1 });

      await generateUserTransactionsExcelSheet(
        transactions,
        (path, filename) => {
          response.set(
            'Content-disposition',
            'attachment; filename=' + filename
          );
          response.set(
            'Content-type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64'
          );
          response.status(200).download(path);

          setTimeout(() => {
            fs.unlinkSync(path);
          }, 30000);
        }
      );
    } catch (error) {
      return response
        .status(200)
        .json({ message: 'Failed to get users excel data.', error });
    }
  }
);

module.exports = router;
