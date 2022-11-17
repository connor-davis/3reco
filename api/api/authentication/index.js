let { Router } = require('express');
let router = Router();
let passport = require('passport');

let registerRoutes = require('./register.routes');
let loginRoutes = require('./login.routes');

/**
 * @openapi
 * /api/v1/auth/check:
 *   get:
 *     description: Check if the user is logged in.
 *     tags: [Authentication]
 *     produces:
 *       - application/text
 *     security:
 *       - Bearer: []
 *     responses:
 *       200:
 *         description: Returns "Authorized".
 *       401:
 *         description: Returns "Unauthorized".
 */
router.get(
  '/check',
  passport.authenticate('jwt', { session: false }),
  async (request, response) => {
    return response.status(200).send('Authorized');
  }
);

router.use('/register', registerRoutes);
router.use('/login', loginRoutes);

module.exports = router;
