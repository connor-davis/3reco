const { Router } = require('express');
const router = Router();
const Inbox = require('../../models/inbox.model');

/**
 * @openapi
 * /api/v1/inbox/:id:
 *   delete:
 *     description: Delete an existing inbox item.
 *     tags: [Inbox]
 *     produces:
 *       - application/json
 *     parameters:
 *       - name: id
 *         description: The inbox item's id.
 *         type: string
 *     responses:
 *       200:
 *         description: Returns "success" or error message.
 *       401:
 *         description: Returns "Unauthorized".
 */
router.delete('/:id', async (request, response) => {
  let { params } = request;

  const found = await Inbox.findOne({ _id: params.id });

  if (!found)
    return response
      .status(200)
      .json({ message: 'Inbox item not found.', error: 'inbox-not-found' });
  else {
    try {
      await Inbox.deleteOne({ _id: params.id });

      return response.status(200).send('success');
    } catch (error) {
      return response
        .status(200)
        .json({ message: 'Error while deleting a inbox item.', error });
    }
  }
});

module.exports = router;
