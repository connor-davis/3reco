const { Router } = require('express');
const router = Router();

const authenticationRoutes = require('./authentication');
const usersRoutes = require('./users');
const adminRoutes = require('./admin');
const stockRoutes = require('./stock');
const materialsRoutes = require("./materials");

/**
 * @openapi
 * components:
 *   securitySchemes:
 *     Bearer:
 *       type: apiKey
 *       name: Authorization
 *       in: header
 */

/**
 * @openapi
 * tags:
 *   - name: Authentication
 *     description: Api authentication routes.
 *   - name: Users
 *     description: Api users routes.
 *   - name: Stock
 *     description: Api stock routes.
 */
router.use('/auth', authenticationRoutes);
router.use('/users', usersRoutes);
router.use('/admin', adminRoutes);
router.use('/stock', stockRoutes);
router.use('/materials', materialsRoutes);

module.exports = router;
