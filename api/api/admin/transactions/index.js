const { Router } = require('express');
const router = Router();
const passport = require('passport');
const Transaction = require('../../../models/transaction.model');
const logger = require('../../../utils/logger');

/**
 * @openapi
 * /api/v1/transactions:
 *   get:
 *     description: Retrieve all transactions.
 *     tags: [Transactions]
 *     produces:
 *       - application/json
 *     security:
 *       - Bearer: []
 *     responses:
 *       200:
 *         description: Returns all transactions.
 *       401:
 *         description: Returns "Unauthorized".
 */
router.get(
  '/',
  passport.authenticate('jwt', { session: false }),
  async (request, response) => {
    const foundData = await Offer.find();

    if (!foundData)
      return response.status(200).json({
        message: 'Transactions not found.',
        error: 'transactions-not-found',
      });
    else {
      const data = [];

      if (found.length === 0)
        return response.status(200).json({
          data,
        });

      Array.from(foundData).map(async (data) => {
        data.push({
          ...data.toJSON(),
        });

        if (data.length === foundData.length) {
          return response.status(200).json({
            data,
          });
        }
      });
    }
  }
);

/**
 * @openapi
 * /api/v1/transactions/pages:
 *   get:
 *     description: Retrieve transactions pages.
 *     tags: [Transactions]
 *     produces:
 *       - application/json
 *     security:
 *       - Bearer: []
 *     responses:
 *       200:
 *         description: Returns transactions pages.
 *       401:
 *         description: Returns "Unauthorized".
 */
router.get(
  '/pages',
  passport.authenticate('jwt', { session: false }),
  async (request, response) => {
    let { limit } = request.query;
    if (!limit) limit = 10;

    const found = await Transaction.find({
      buyerPhoneNumber: { $eq: request.user.phoneNumber },
      sellerPhoneNumber: { $eq: request.user.phoneNumber },
    });

    if (!found) return response.status(200).json({ pages: 0 });
    else {
      let pageList = [];

      let result = await Transaction.find()
        .sort({ date: -1 })
        .skip(pageList.length * limit)
        .limit(limit);

      while (result.length > 0) {
        pageList.push([
          ...result.map((item) => {
            return item;
          }),
        ]);

        result = await Transaction.find()
          .sort({ date: -1 })
          .skip(pageList.length * limit)
          .limit(limit);
      }

      let pages = pageList.length;

      return response.status(200).json({ pages });
    }
  }
);

/**
 * @openapi
 * /api/v1/transactions/page/:page:
 *   get:
 *     description: Retrieve transactions page by page number.
 *     tags: [Transactions]
 *     produces:
 *       - application/json
 *     security:
 *       - Bearer: []
 *     responses:
 *       200:
 *         description: Returns transactions for page.
 *       401:
 *         description: Returns "Unauthorized".
 */
router.get(
  '/page/:page',
  passport.authenticate('jwt', { session: false }),
  async (request, response) => {
    const { page } = request.params;
    let { limit } = request.query;
    if (!limit) limit = 10;

    const found = await Transaction.find()
      .sort({ date: -1 })
      .skip((page - 1) * limit > 0 ? (page - 1) * limit : 0)
      .limit(limit);

    if (!found) return response.status(200).json({ pageData: [] });
    else {
      let pageData = [];

      if (found.length === 0)
        return response.status(200).json({
          pageData,
        });

      found.map(async (item) => {
        pageData.push({
          ...item.toJSON(),
        });

        if (pageData.length === found.length) {
          return response.status(200).json({
            pageData,
          });
        }
      });
    }
  }
);

/**
 * @openapi
 * /api/v1/transactions/:id:
 *   get:
 *     description: Retrieve transaction item.
 *     tags: [Transactions]
 *     produces:
 *       - application/json
 *     security:
 *       - Bearer: []
 *     responses:
 *       200:
 *         description: Returns transaction item.
 *       401:
 *         description: Returns "Unauthorized".
 */
router.get(
  '/:id',
  passport.authenticate('jwt', { session: false }),
  async (request, response) => {
    const { id } = request.params;

    const found = await Transaction.findOne({ _id: id });

    if (!found)
      return response.status(200).json({
        message: 'Transaction item not found.',
        error: 'transaction-item-not-found',
      });
    else {
      return response.status(200).json({
        data: {
          ...found.toJSON(),
        },
      });
    }
  }
);

module.exports = router;
