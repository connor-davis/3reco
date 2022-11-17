let { Router } = require('express');
let router = Router();
let User = require('../../models/user.model');

/**
 * @openapi
 * /api/v1/users:
 *   put:
 *     description: Update an existing user.
 *     tags: [Users]
 *     produces:
 *       - application/json
 *     parameters:
 *       - name: email
 *         description: The user's email.
 *         type: string
 *     responses:
 *       200:
 *         description: Returns the users updated data.
 *       401:
 *         description: Returns "Unauthorized".
 */
router.put('/', async (request, response) => {
  let { body, user } = request;

  const found = await User.findOne({ _id: body._id });

  delete body.__v;

  if (!found)
    return response
      .status(200)
      .json({ message: 'User not found.', error: 'user-not-found' });
  else {
    try {
      await User.updateOne({ _id: body._id }, body);

      const userData = await User.findOne({ _id: body._id });

      return response
        .status(200)
        .json({ data: { ...userData.toJSON(), password: undefined } });
    } catch (error) {
      return response
        .status(200)
        .json({ message: 'Error while updating a user.', error });
    }
  }
});

module.exports = router;
