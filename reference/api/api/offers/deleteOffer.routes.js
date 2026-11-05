const { Router } = require('express');
const router = Router();
const Offer = require('../../models/offer.model');
const Stock = require('../../models/stock.model');

/**
 * @openapi
 * /api/v1/offers:
 *   delete:
 *     description: Delete an existing offer item.
 *     tags: [Offer]
 *     produces:
 *       - application/json
 *     parameters:
 *       - name: id
 *         description: The offer item's id.
 *         type: string
 *     responses:
 *       200:
 *         description: Returns "success" or error message.
 *       401:
 *         description: Returns "Unauthorized".
 */
router.delete('/:id', async (request, response) => {
  let { params } = request;

  const found = await Offer.findOne({ stockId: params.id });

  if (!found)
    return response.status(200).json({
      message: 'Offer item not found.',
      error: 'offer-not-found',
    });
  else {
    try {
      await Stock.updateOne({ _id: params.id }, { isOffered: false });

      await Offer.deleteOne({ stockId: params.id });

      return response.status(200).send('success');
    } catch (error) {
      return response
        .status(200)
        .json({ message: 'Error while deleting a offer item.', error });
    }
  }
});

module.exports = router;
