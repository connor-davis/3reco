let { Router } = require('express');
let router = Router();
let passport = require('passport');

let User = require('../../models/user.model');

/**
 * @openapi
 * /api/v1/users:
 *   get:
 *     description: Get all users.
 *     tags: [Admin]
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
  '/users/',
  passport.authenticate('jwt', { session: false }),
  async (request, response) => {
    let { user } = request;

    if (user.businessType !== 'admin') return response.status(401);

    try {
      if ((await User.count()) > 1) {
        const found = await User.find();
        const data = found.map((user) => {
          return { ...user.toJSON() };
        });

        return response.status(200).json({
          data: [
            ...data.map((d) => {
              return { ...d, password: undefined };
            }),
          ],
        });
      } else {
        return response.status(200).json({ data: [] });
      }
    } catch (error) {
      return response
        .status(200)
        .json({ message: 'Error while retrieving users.', error });
    }
  }
);

/**
 * @openapi
 * /api/v1/users/:id:
 *   get:
 *     description: Get a specific user.
 *     tags: [Admin]
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
  '/users/:id',
  passport.authenticate('jwt', { session: false }),
  async (request, response) => {
    let { user } = request;
    let { id } = request.params;

    if (user.businessType !== 'admin') return response.status(401);

    const found = await User.findOne({ _id: id });

    if (!found)
      return response.status(200).json({ message: 'User not found.' });
    else
      return response.status(200).json({
        data: {
          ...found.toJSON(),
          password: undefined,
        },
      });
  }
);

router.use('/passwordReset', require('./passwordReset.routes'));
router.use('/deleteUser', require('./deleteUser.routes'));
// router.use('/exportUser', require('./userData/exportUser.routes'));
// router.use('/exportUsers', require('./userData/exportUsers.routes'));

module.exports = router;
