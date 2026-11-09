let { Router } = require('express');
let router = Router();
let User = require('../../models/user.model');

/**
 * @openapi
 * /api/v1/users:
 *   delete:
 *     description: Delete an existing user.
 *     tags: [Users]
 *     produces:
 *       - application/json
 *     parameters:
 *       - name: email
 *         description: The user's email.
 *         type: string
 *     responses:
 *       200:
 *         description: Returns "success" or error message.
 *       401:
 *         description: Returns "Unauthorized".
 */
router.delete('/:id', async (request, response) => {
  let { params } = request;

  const found = await User.findOne({ _id: params.id });

  if (!found)
    return response
      .status(200)
      .json({ message: 'User not found.', error: 'user-not-found' });
  else {
    try {
      await User.deleteOne({ _id: params.id });

      return response.status(200).send('success');
    } catch (error) {
      return response
        .status(200)
        .json({ message: 'Error while deleting a user.', error });
    }
  }
});

module.exports = router;
