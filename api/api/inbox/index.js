const { Router } = require('express');
const router = Router();
const passport = require('passport');
const Inbox = require('../../models/inbox.model');
const composeRoutes = require('./compose.routes');
const deleteRoutes = require('./delete.routes');

/**
 * @openapi
 * /api/v1/inbox:
 *   get:
 *     description: Retrieve all inbox.
 *     tags: [Inbox]
 *     produces:
 *       - application/json
 *     security:
 *       - Bearer: []
 *     responses:
 *       200:
 *         description: Returns all inbox.
 *       401:
 *         description: Returns "Unauthorized".
 */
router.get(
  '/',
  passport.authenticate('jwt', { session: false }),
  async (request, response) => {
    const found = await Inbox.find({ recipient: request.user.phoneNumber });

    if (!found)
      return response.status(200).json({
        message: 'Inbox data not found.',
        error: 'inbox-data-not-found',
      });
    else {
      return response
        .status(200)
        .json({ data: { ...found.toJSON(), password: undefined } });
    }
  }
);

/**
 * @openapi
 * /api/v1/inbox/pages:
 *   get:
 *     description: Retrieve inbox pages.
 *     tags: [Inbox]
 *     produces:
 *       - application/json
 *     security:
 *       - Bearer: []
 *     responses:
 *       200:
 *         description: Returns inbox pages.
 *       401:
 *         description: Returns "Unauthorized".
 */
router.get(
  '/pages',
  passport.authenticate('jwt', { session: false }),
  async (request, response) => {
    let { limit } = request.query;
    if (!limit) limit = 10;

    const found = await Inbox.find({ recipient: request.user.phoneNumber });

    if (!found) return response.status(200).json({ pages: 0 });
    else {
      let pageList = [];

      let result = await Inbox.find({ recipient: request.user.phoneNumber })
        .skip(pageList.length * limit)
        .limit(limit);

      while (result.length > 0) {
        pageList.push([
          ...result.map((item) => {
            return item;
          }),
        ]);

        result = await Inbox.find({ recipient: request.user.phoneNumber })
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
 * /api/v1/inbox/page/:page:
 *   get:
 *     description: Retrieve inbox page.
 *     tags: [Inbox]
 *     produces:
 *       - application/json
 *     security:
 *       - Bearer: []
 *     responses:
 *       200:
 *         description: Returns inbox page.
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

    const found = await Inbox.find({ recipient: request.user.phoneNumber })
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
 * /api/v1/inbox/:id:
 *   get:
 *     description: Retrieve inbox item.
 *     tags: [Inbox]
 *     produces:
 *       - application/json
 *     security:
 *       - Bearer: []
 *     responses:
 *       200:
 *         description: Returns inbox item.
 *       401:
 *         description: Returns "Unauthorized".
 */
router.get(
  '/:id',
  passport.authenticate('jwt', { session: false }),
  async (request, response) => {
    const { id } = request.params;

    const found = await Inbox.findOne({ _id: id });

    if (!found)
      return response.status(200).json({
        message: 'Inbox item not found.',
        error: 'inbox-item-not-found',
      });
    else {
      return response.status(200).json({ data: { ...found.toJSON() } });
    }
  }
);

router.use(
  '/compose',
  passport.authenticate('jwt', { session: false }),
  composeRoutes
);

router.use('/', passport.authenticate('jwt', { session: false }), deleteRoutes);

module.exports = router;
