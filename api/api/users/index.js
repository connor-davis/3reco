let { Router } = require('express');
let router = Router();
let passport = require('passport');
let updateUserRoutes = require('./updateUser.routes');
let User = require('../../models/user.model');

/**
 * @openapi
 * /api/v1/users:
 *   get:
 *     description: Retrieve the users data.
 *     tags: [Users]
 *     produces:
 *       - application/json
 *     security:
 *       - Bearer: []
 *     responses:
 *       200:
 *         description: Returns the user's data.
 *       401:
 *         description: Returns "Unauthorized".
 */
router.get(
  '/',
  passport.authenticate('jwt', { session: false }),
  async (request, response) => {
    const found = await User.findOne({ email: request.user.email });

    if (!found)
      return response
        .status(200)
        .json({ message: 'User not found.', error: 'user-not-found' });
    else {
      return response
        .status(200)
        .json({ data: { ...found.toJSON(), password: undefined } });
    }
  }
);

router.use(
  '/',
  passport.authenticate('jwt', { session: false }),
  updateUserRoutes
);

module.exports = router;
