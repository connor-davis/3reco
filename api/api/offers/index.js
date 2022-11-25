const { Router } = require('express');
const router = Router();
const passport = require('passport');
const Offer = require('../../models/offer.model');
const User = require('../../models/user.model');
const Stock = require('../../models/stock.model');
const logger = require('../../utils/logger');

const createOfferRoutes = require('./createOffer.routes');
const deleteOfferRoutes = require('./deleteOffer.routes');

/**
 * @openapi
 * /api/v1/offers:
 *   get:
 *     description: Retrieve all offers.
 *     tags: [Offers]
 *     produces:
 *       - application/json
 *     security:
 *       - Bearer: []
 *     responses:
 *       200:
 *         description: Returns all offers.
 *       401:
 *         description: Returns "Unauthorized".
 */
router.get(
  '/',
  passport.authenticate('jwt', { session: false }),
  async (request, response) => {
    const foundData = await Offer.find({
      owner: { $ne: request.user.phoneNumber },
    });

    if (!foundData)
      return response.status(200).json({
        message: 'Offers not found.',
        error: 'offers-not-found',
      });
    else {
      const data = [];

      if (found.length === 0)
        return response.status(200).json({
          data,
        });

      Array.from(foundData).map(async (data) => {
        const userFound = await User.findOne({ phoneNumber: data.owner });
        const stockFound = await Stock.findOne({ _id: data.stockId });

        data.push({
          ...data.toJSON(),
          user: userFound.toJSON(),
          stock: stockFound.toJSON(),
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
 * /api/v1/offers/pages:
 *   get:
 *     description: Retrieve offers pages.
 *     tags: [Offers]
 *     produces:
 *       - application/json
 *     security:
 *       - Bearer: []
 *     responses:
 *       200:
 *         description: Returns offers pages.
 *       401:
 *         description: Returns "Unauthorized".
 */
router.get(
  '/pages',
  passport.authenticate('jwt', { session: false }),
  async (request, response) => {
    let { limit } = request.query;
    if (!limit) limit = 10;

    const found = await Offer.find({
      owner: { $ne: request.user.phoneNumber },
    });

    if (!found) return response.status(200).json({ pages: 0 });
    else {
      let pageList = [];

      let result = await Offer.find({
        owner: { $ne: request.user.phoneNumber },
      })
        .skip(pageList.length * limit)
        .limit(limit);

      while (result.length > 0) {
        pageList.push([
          ...result.map((item) => {
            return item;
          }),
        ]);

        result = await Offer.find({ owner: { $ne: request.user.phoneNumber } })
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
 * /api/v1/offers/page/:page:
 *   get:
 *     description: Retrieve offers page by page number.
 *     tags: [Offers]
 *     produces:
 *       - application/json
 *     security:
 *       - Bearer: []
 *     responses:
 *       200:
 *         description: Returns offers for page.
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

    const found = await Offer.find({ owner: { $ne: request.user.phoneNumber } })
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
        const userFound = await User.findOne({ phoneNumber: item.owner });
        const stockFound = await Stock.findOne({ _id: item.stockId });

        pageData.push({
          ...item.toJSON(),
          user: userFound.toJSON(),
          stock: stockFound.toJSON(),
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
 * /api/v1/offers/:id:
 *   get:
 *     description: Retrieve offer item.
 *     tags: [Offers]
 *     produces:
 *       - application/json
 *     security:
 *       - Bearer: []
 *     responses:
 *       200:
 *         description: Returns offer item.
 *       401:
 *         description: Returns "Unauthorized".
 */
router.get(
  '/:id',
  passport.authenticate('jwt', { session: false }),
  async (request, response) => {
    const { id } = request.params;

    const found = await Offer.findOne({ _id: id });
    const userFound = await User.findOne({ phoneNumber: found.owner });
    const stockFound = await Stock.findOne({ _id: found.stockId });

    if (!found)
      return response.status(200).json({
        message: 'Offer item not found.',
        error: 'offer-item-not-found',
      });
    else {
      return response.status(200).json({
        data: {
          ...found.toJSON(),
          user: userFound.toJSON(),
          stock: stockFound.toJSON(),
        },
      });
    }
  }
);

router.use(
  '/',
  passport.authenticate('jwt', { session: false }),
  createOfferRoutes
);

router.use(
  '/',
  passport.authenticate('jwt', { session: false }),
  deleteOfferRoutes
);

module.exports = router;
