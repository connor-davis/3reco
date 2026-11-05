const { Router } = require('express');
const router = Router();
const Material = require('../../models/material.model');

/**
 * @openapi
 * /api/v1/materials:
 *   post:
 *     description: Create a new material item.
 *     tags: [Materials]
 *     produces:
 *       - application/json
 *     parameters:
 *       - name: type
 *         description: The material item's type.
 *         type: string
 *       - name: value
 *         description: The material item's value.
 *         type: number
 *     security:
 *       - Bearer: []
 *     responses:
 *       200:
 *         description: Returns the material item's data.
 *       401:
 *         description: Returns "Unauthorized".
 */
router.post('/', async (request, response) => {
  let { body, user } = request;

  try {
    const newMaterial = new Material({
      owner: user.phoneNumber,
      type: body.type,
      value: parseFloat(body.value),
    });

    newMaterial.save();

    const data = newMaterial.toJSON();

    return response.status(200).json({ data });
  } catch (error) {
    console.log(error);

    return response
      .status(200)
      .json({ message: 'Error while creating a material item.', error });
  }
});

module.exports = router;
