const { Router } = require('express');
const router = Router();
const passport = require('passport');
const Stock = require('../../models/stock.model');
const createStockRoutes = require('./createStock.routes');
const updateStockRoutes = require('./updateStock.routes');
const deleteStockRoutes = require('./deleteStock.routes');
const logger = require('../../utils/logger');

/**
 * @openapi
 * /api/v1/stock:
 *   get:
 *     description: Retrieve all stock.
 *     tags: [Stock]
 *     produces:
 *       - application/json
 *     security:
 *       - Bearer: []
 *     responses:
 *       200:
 *         description: Returns all stock.
 *       401:
 *         description: Returns "Unauthorized".
 */
router.get(
  '/',
  passport.authenticate('jwt', { session: false }),
  async (request, response) => {
    const found = await Stock.find({ owner: request.user.phoneNumber });

    if (!found)
      return response
        .status(200)
        .json({ message: 'Stock not found.', error: 'stock-not-found' });
    else {
      return response
        .status(200)
        .json({ data: { ...found.toJSON(), password: undefined } });
    }
  }
);

/**
 * @openapi
 * /api/v1/stock/pages:
 *   get:
 *     description: Retrieve stock pages.
 *     tags: [Stock]
 *     produces:
 *       - application/json
 *     security:
 *       - Bearer: []
 *     responses:
 *       200:
 *         description: Returns stock pages.
 *       401:
 *         description: Returns "Unauthorized".
 */
router.get(
  '/pages',
  passport.authenticate('jwt', { session: false }),
  async (request, response) => {
    let { limit } = request.query;
    if (!limit) limit = 10;
    
    const found = await Stock.find({ owner: request.user.phoneNumber });

    if (!found) return response.status(200).json({ pages: 0 });
    else {
      let pageList = [];

      let result = await Stock.find({ owner: request.user.phoneNumber })
        .skip(pageList.length * limit)
        .limit(limit);

      while (result.length > 0) {
        pageList.push([
          ...result.map((item) => {
            return item;
          }),
        ]);

        result = await Stock.find({ owner: request.user.phoneNumber })
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
 * /api/v1/stock/pages:
 *   get:
 *     description: Retrieve stock pages.
 *     tags: [Stock]
 *     produces:
 *       - application/json
 *     security:
 *       - Bearer: []
 *     responses:
 *       200:
 *         description: Returns stock pages.
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

    const found = await Stock.find({ owner: request.user.phoneNumber })
      .skip((page - 1) * limit > 0 ? (page - 1) * limit : 0)
      .limit(limit);

    if (!found) return response.status(200).json({ pageData: [] });
    else
      return response.status(200).json({
        pageData: found.map((item) => {
          return item;
        }),
      });
  }
);

/**
 * @openapi
 * /api/v1/stock/:id:
 *   get:
 *     description: Retrieve stock item.
 *     tags: [Stock]
 *     produces:
 *       - application/json
 *     security:
 *       - Bearer: []
 *     responses:
 *       200:
 *         description: Returns stock item.
 *       401:
 *         description: Returns "Unauthorized".
 */
router.get(
  '/:id',
  passport.authenticate('jwt', { session: false }),
  async (request, response) => {
    const { id } = request.params;

    const found = await Stock.findOne({ _id: id });

    if (!found)
      return response.status(200).json({
        message: 'Stock item not found.',
        error: 'stock-item-not-found',
      });
    else {
      return response.status(200).json({ data: { ...found.toJSON() } });
    }
  }
);

router.use(
  '/',
  passport.authenticate('jwt', { session: false }),
  createStockRoutes
);

router.use(
  '/',
  passport.authenticate('jwt', { session: false }),
  updateStockRoutes
);

router.use(
  '/',
  passport.authenticate('jwt', { session: false }),
  deleteStockRoutes
);

module.exports = router;
