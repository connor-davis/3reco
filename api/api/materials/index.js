const { Router } = require('express');
const router = Router();
const passport = require('passport');
const Material = require('../../models/material.model');
const createMaterialRoutes = require('./createMaterial.routes');
const updateMaterialRoutes = require('./updateMaterial.routes');
const deleteMaterialRoutes = require('./deleteMaterial.routes');
const logger = require('../../utils/logger');

/**
 * @openapi
 * /api/v1/materials:
 *   get:
 *     description: Retrieve all materials.
 *     tags: [Materials]
 *     produces:
 *       - application/json
 *     security:
 *       - Bearer: []
 *     responses:
 *       200:
 *         description: Returns all materials.
 *       401:
 *         description: Returns "Unauthorized".
 */
router.get(
  '/',
  passport.authenticate('jwt', { session: false }),
  async (request, response) => {
    const foundData = await Material.find({ owner: request.user.email });

    const data = foundData.map((material) => {
      const obj = material.toJSON();

      return {
        _id: obj._id.toString(),
        owner: obj.owner,
        type: obj.type,
        value: obj.value  
      };
    });

    if (!data)
      return response
        .status(200)
        .json({ message: 'Materials not found.', error: 'materials-not-found' });
    else {
      return response
        .status(200)
        .json({ data: Array.from(data) });
    }
  }
);

/**
 * @openapi
 * /api/v1/materials/pages:
 *   get:
 *     description: Retrieve materials pages.
 *     tags: [Materials]
 *     produces:
 *       - application/json
 *     security:
 *       - Bearer: []
 *     responses:
 *       200:
 *         description: Returns materials pages.
 *       401:
 *         description: Returns "Unauthorized".
 */
router.get(
  '/pages',
  passport.authenticate('jwt', { session: false }),
  async (request, response) => {
    let { limit } = request.query;
    if (!limit) limit = 10;
    
    const found = await Material.find({ owner: request.user.email });

    if (!found) return response.status(200).json({ pages: 0 });
    else {
      let pageList = [];

      let result = await Material.find({ owner: request.user.email })
        .skip(pageList.length * limit)
        .limit(limit);

      while (result.length > 0) {
        pageList.push([
          ...result.map((item) => {
            return item;
          }),
        ]);

        result = await Material.find({ owner: request.user.email })
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
 * /api/v1/materials/page/:page:
 *   get:
 *     description: Retrieve materials page by page number.
 *     tags: [Materials]
 *     produces:
 *       - application/json
 *     security:
 *       - Bearer: []
 *     responses:
 *       200:
 *         description: Returns materials for page.
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

    const found = await Material.find({ owner: request.user.email })
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
 * /api/v1/materials/:id:
 *   get:
 *     description: Retrieve material item.
 *     tags: [Materials]
 *     produces:
 *       - application/json
 *     security:
 *       - Bearer: []
 *     responses:
 *       200:
 *         description: Returns material item.
 *       401:
 *         description: Returns "Unauthorized".
 */
router.get(
  '/:id',
  passport.authenticate('jwt', { session: false }),
  async (request, response) => {
    const { id } = request.params;

    const found = await Material.findOne({ _id: id });

    if (!found)
      return response.status(200).json({
        message: 'Material item not found.',
        error: 'material-item-not-found',
      });
    else {
      return response.status(200).json({ data: { ...found.toJSON() } });
    }
  }
);

router.use(
  '/',
  passport.authenticate('jwt', { session: false }),
  createMaterialRoutes
);

router.use(
  '/',
  passport.authenticate('jwt', { session: false }),
  updateMaterialRoutes
);

router.use(
  '/',
  passport.authenticate('jwt', { session: false }),
  deleteMaterialRoutes
);

module.exports = router;
