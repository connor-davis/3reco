const { Router } = require('express');
const router = Router();
const Materials = require('../../models/material.model');

/**
 * @openapi
 * /api/v1/materials:
 *   delete:
 *     description: Delete an existing material item.
 *     tags: [Materials]
 *     produces:
 *       - application/json
 *     parameters:
 *       - name: id
 *         description: The material item's id.
 *         type: string
 *     responses:
 *       200:
 *         description: Returns "success" or error message.
 *       401:
 *         description: Returns "Unauthorized".
 */
router.delete('/:id', async (request, response) => {
  let { params } = request;

  const found = await Materials.findOne({ _id: params.id });

  if (!found)
    return response
      .status(200)
      .json({ message: 'Material item not found.', error: 'material-not-found' });
  else {
    try {
      await Materials.deleteOne({ _id: params.id });

      return response.status(200).send('success');
    } catch (error) {
      return response
        .status(200)
        .json({ message: 'Error while deleting a material item.', error });
    }
  }
});

module.exports = router;
