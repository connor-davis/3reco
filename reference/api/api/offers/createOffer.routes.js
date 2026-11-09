const { Router } = require('express');
const router = Router();
const Offer = require('../../models/offer.model');
const Stock = require('../../models/stock.model');

/**
 * @openapi
 * /api/v1/offers:
 *   post:
 *     description: Create a new offer item.
 *     tags: [Offers]
 *     produces:
 *       - application/json
 *     parameters:
 *       - name: stockId
 *         description: The offer item's stockId.
 *         type: number
 *     security:
 *       - Bearer: []
 *     responses:
 *       200:
 *         description: Returns the offer item's data.
 *       401:
 *         description: Returns "Unauthorized".
 */
router.post('/', async (request, response) => {
  let { body, user } = request;

  try {
    const newOffer = new Offer({
      owner: user.phoneNumber,
      stockId: body._id,
      materialType: body.stockType,
    });

    newOffer.save();

    const data = newOffer.toJSON();

    await Stock.updateOne({ _id: body._id }, { isOffered: true });

    return response.status(200).json({ data });
  } catch (error) {
    console.log(error);

    return response
      .status(200)
      .json({ message: 'Error while creating a offer item.', error });
  }
});

module.exports = router;
