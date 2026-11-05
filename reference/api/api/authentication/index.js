const { Router } = require('express');
const router = Router();
const passport = require('passport');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const User = require('../../models/user.model');

const registerRoutes = require('./register.routes');
const loginRoutes = require('./login.routes');

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
    const privateKey = fs.readFileSync('certs/privateKey.pem', {
      encoding: 'utf-8',
    });

    const phoneNumber = request.user.phoneNumber;
    const data = await User.findOne({ phoneNumber });

    if (!data) return response.status(401).send('Unauthorized');
    else {
      const token = jwt.sign(
        {
          sub: data._id,
          phoneNumber: data.phoneNumber,
        },
        privateKey,
        { expiresIn: '1d', algorithm: 'RS256' }
      );

      return response.status(200).json({
        data: {
          ...data.toJSON(),
          password: undefined,
          authenticationToken: token,
        },
      });
    }
  }
);

router.use('/register', registerRoutes);
router.use('/login', loginRoutes);

module.exports = router;
