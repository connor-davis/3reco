const { Router } = require('express');
const router = Router();
const Stock = require('../../models/stock.model');

/**
 * @openapi
 * /api/v1/stock:
 *   put:
 *     description: Update an existing stock item.
 *     tags: [Stock]
 *     produces:
 *       - application/json
 *     parameters:
 *       - name: _id
 *         description: The stock item's id.
 *         type: string
 *     responses:
 *       200:
 *         description: Returns the stock item's updated data.
 *       401:
 *         description: Returns "Unauthorized".
 */
router.put('/', async (request, response) => {
  let { body, user } = request;

  const found = await Stock.findOne({ _id: body._id });

  delete body.__v;

  console.log(body);

  if (!found)
    return response
      .status(200)
      .json({ message: 'Stock item not found.', error: 'stock-not-found' });
  else {
    try {
      await Stock.updateOne({ _id: body._id }, body);

      const stockData = await Stock.findOne({ _id: body._id });

      console.log(stockData);

      return response.status(200).json({ data: { ...stockData.toJSON() } });
    } catch (error) {
      return response
        .status(200)
        .json({ message: 'Error while updating a stock item.', error });
    }
  }
});

module.exports = router;
