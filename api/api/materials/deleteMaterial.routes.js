const { Router } = require('express');
const router = Router();
const Materials = require('../../models/material.model');
const Stock = require('../../models/stock.model');

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
    return response.status(200).json({
      message: 'Material item not found.',
      error: 'material-not-found',
    });
  else {
    try {
      const stockFound = await Stock.find({ stockType: found.type });

      if (stockFound.length === 0) {
        await Materials.deleteOne({ _id: params.id });

        return response.status(200).send('success');
      } else {
        return response.status(200).json({
          message:
            'Stock still exists related to the material. Please delete the stock first.',
          error: 'stock-found',
        });
      }
    } catch (error) {
      return response
        .status(200)
        .json({ message: 'Error while deleting a material item.', error });
    }
  }
});

module.exports = router;
