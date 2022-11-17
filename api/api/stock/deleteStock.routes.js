const { Router } = require('express');
const router = Router();
const Stock = require('../../models/stock.model');

/**
 * @openapi
 * /api/v1/stock:
 *   delete:
 *     description: Delete an existing stock item.
 *     tags: [Stock]
 *     produces:
 *       - application/json
 *     parameters:
 *       - name: id
 *         description: The stock item's id.
 *         type: string
 *     responses:
 *       200:
 *         description: Returns "success" or error message.
 *       401:
 *         description: Returns "Unauthorized".
 */
router.delete('/:id', async (request, response) => {
  let { params } = request;

  const found = await Stock.findOne({ _id: params.id });

  if (!found)
    return response
      .status(200)
      .json({ message: 'Stock item not found.', error: 'stock-not-found' });
  else {
    try {
      await Stock.deleteOne({ _id: params.id });

      return response.status(200).send('success');
    } catch (error) {
      return response
        .status(200)
        .json({ message: 'Error while deleting a stock item.', error });
    }
  }
});

module.exports = router;
