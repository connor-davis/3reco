const { Router } = require('express');
const router = Router();
const Stock = require('../../models/stock.model');

/**
 * @openapi
 * /api/v1/stock:
 *   post:
 *     description: Create a new stock item.
 *     tags: [Stock]
 *     produces:
 *       - application/json
 *     parameters:
 *       - name: stockName
 *         description: The stock item's name.
 *         type: string
 *       - name: stockDescription
 *         description: The stock item's description.
 *         type: string
 *       - name: stockWeight
 *         description: The stock item's weight.
 *         type: number
 *       - name: stockValue
 *         description: The stock item's value.
 *         type: number
 *       - name: stockType
 *         description: The stock item's type.
 *         type: string
 *     security:
 *       - Bearer: []
 *     responses:
 *       200:
 *         description: Returns the stock item's data.
 *       401:
 *         description: Returns "Unauthorized".
 */
router.post('/', async (request, response) => {
  let { body, user } = request;

  if (!body.stockName)
    return response.status(200).json({
      message: 'Please make sure that your stock has a name.',
      error: 'no-stock-name',
    });
  if (!body.stockDescription)
    return response.status(200).json({
      message: 'Please make sure that your stock has a description.',
      error: 'no-stock-description',
    });
  if (!body.stockWeight)
    return response.status(200).json({
      message: 'Please make sure that your stock has a weight.',
      error: 'no-stock-weight',
    });
  if (!body.stockValue)
    return response.status(200).json({
      message: 'Please make sure that your stock has a value.',
      error: 'no-stock-value',
    });
  if (!body.stockType)
    return response.status(200).json({
      message: 'Please make sure that your stock has a material.',
      error: 'no-stock-material',
    });

  try {
    const newStock = new Stock({
      owner: user.phoneNumber,
      stockName: body.stockName,
      stockDescription: body.stockDescription || 'No description.',
      stockWeight: parseFloat(body.stockWeight),
      stockValue: parseFloat(body.stockValue),
      stockType: body.stockType,
    });

    newStock.save();

    const data = newStock.toJSON();

    return response.status(200).json({ data });
  } catch (error) {
    console.log(error);

    return response
      .status(200)
      .json({ message: 'Error while creating a stock item.', error });
  }
});

module.exports = router;
