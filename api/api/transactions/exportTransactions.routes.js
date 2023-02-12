const { Router } = require('express');
const router = Router();
const passport = require('passport');
const fs = require('fs');

const Transaction = require('../../models/transaction.model');
const generateUserTransactionsExcelSheet = require('../utils/excel/generateUserTransactionsExcelSheet.js');

/**
 * @openapi
 * /api/v1/transactions/export:
 *   get:
 *     description: Retrieve transactions excel data for the user.
 *     tags: [Transactions]
 *     produces:
 *       - application/json
 *     security:
 *       - Bearer: []
 *     responses:
 *       200:
 *         description: Returns transactions excel data for the user.
 *       401:
 *         description: Returns "Unauthorized".
 */
router.get(
  '/',
  passport.authenticate('jwt', { session: false }),
  async (request, response) => {
    try {
      const transactions = await Transaction.find({
        $or: [
          { buyerPhoneNumber: { $eq: request.user.phoneNumber } },
          { sellerPhoneNumber: { $eq: request.user.phoneNumber } },
        ],
      }).sort({ date: -1 });

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
      console.log(error);

      return response
        .status(200)
        .json({ message: 'Failed to get users excel data.', error });
    }
  }
);

module.exports = router;
