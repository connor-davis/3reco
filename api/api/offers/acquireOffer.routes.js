const { Router } = require('express');
const router = Router();
const Offer = require('../../models/offer.model');
const User = require('../../models/user.model');
const Stock = require('../../models/stock.model');
const Material = require('../../models/material.model');
const Inbox = require('../../models/inbox.model');
const AcquisitionRequest = require('../../models/acquisitionRequest.model');
const inboxTypes = require('../../types/inbox.types');

/**
 * @openapi
 * /api/v1/offers/acquire/request:
 *   post:
 *     description: Create a new offer acquisition request.
 *     tags: [Offers]
 *     produces:
 *       - application/json
 *     security:
 *       - Bearer: []
 *     responses:
 *       200:
 *         description: Returns the offer acquisition request's data.
 *       401:
 *         description: Returns "Unauthorized".
 */
router.post('/request', async (request, response) => {
  let { body, user } = request;

  const senderFound = await User.findOne({ phoneNumber: user.phoneNumber });
  const recipientFound = await User.findOne({ _id: body.offererId });

  const materialFound = await Material.findOne({
    owner: user.phoneNumber,
    type: body.stockType,
  });

  if (!materialFound)
    return response.status(200).json({
      message:
        'You need to have the ' +
        body.stockType +
        ' material on your account before acquiring this offer.',
      error: 'material-not-found',
    });

  if (!recipientFound)
    return response.status(200).json({
      message: 'The users account has been deleted.',
      error: 'user-not-found',
    });

  try {
    const newAcquisitionRequest = new AcquisitionRequest({
      requester: user._id,
      offerer: body.offererId,
      stockId: body.stockId,
      stockName: body.stockName,
      weight: body.weight,
    });

    newAcquisitionRequest.save();

    const newInboxItem = new Inbox({
      sender: {
        ...senderFound.toJSON(),
        password: undefined,
      },
      recipient: recipientFound.phoneNumber,
      title: `Acquisition Request: ${body.stockName}`,
      content: `Hello ${
        recipientFound.userType === 'standard'
          ? `${recipientFound.firstName} ${recipientFound.lastName}`
          : recipientFound.businessName
      },\n<br />I would like to acquire <span class="font-semibold">${
        body.weight
      } kg</span> of your <span class="font-semibold">${
        body.stockName
      }</span> stock. Feel free to discuss further before accepting or rejecting this request.\n<br />Best Regards,\n${
        user.userType === 'standard'
          ? `${user.firstName} ${user.lastName}`
          : user.businessName
      }`,
      attachments: [
        ...body.attachments,
        {
          type: inboxTypes.ACQUISITION_REQUEST_ACCEPT_OR_REJECT,
          id: newAcquisitionRequest._id,
          offererId: recipientFound._id,
        },
      ],
    });

    newInboxItem.save();

    return response.status(200).json({ message: 'Acquisiton request sent.' });
  } catch (error) {
    console.log(error);

    return response.status(200).json({
      message: 'Error while performing updates on an acquisition request.',
      error,
    });
  }
});

/**
 * @openapi
 * /api/v1/offers/acquire/accept/offerer:
 *   post:
 *     description: Accept a offer acquisition request.
 *     tags: [Offers]
 *     produces:
 *       - application/json
 *     security:
 *       - Bearer: []
 *     responses:
 *       200:
 *         description: Returns the accepted offer acquisition request's data.
 *       401:
 *         description: Returns "Unauthorized".
 */
router.post('/accept/offerer', async (request, response) => {
  let { body, user } = request;

  const acquisitionRequestFound = await AcquisitionRequest.findOne({
    _id: body.id,
  });

  if (!acquisitionRequestFound)
    return response.status(200).json({
      message: 'Acquisition request not found.',
      error: 'acquisition-request-not-found',
    });

  const offererFound = await User.findOne({
    _id: acquisitionRequestFound.offerer,
  });
  const requesterFound = await User.findOne({
    _id: acquisitionRequestFound.requester,
  });

  try {
    const newInboxItem = new Inbox({
      sender: {
        ...offererFound.toJSON(),
        password: undefined,
      },
      recipient: requesterFound.phoneNumber,
      title: `Acquisition Accepted: ${acquisitionRequestFound.stockName}`,
      content: `Hello ${
        requesterFound.userType === 'standard'
          ? `${requesterFound.firstName} ${requesterFound.lastName}`
          : requesterFound.businessName
      },\n<br />I would like to inform you that your request for <span class="font-semibold">${
        acquisitionRequestFound.weight
      } kg</span> of my ${
        acquisitionRequestFound.stockName
      } stock has been accepted. Feel free to discuss further before accepting or rejecting this request.\n<br />Best Regards,\n${
        offererFound.userType === 'standard'
          ? `${offererFound.firstName} ${offererFound.lastName}`
          : offererFound.businessName
      }`,
      attachments: [
        {
          type: inboxTypes.ACQUISITION_REQUEST_ACCEPT_OR_REJECT,
          id: acquisitionRequestFound._id,
          offererId: offererFound._id,
        },
      ],
    });

    newInboxItem.save();

    return response
      .status(200)
      .json({ message: 'Acquisiton request accept sent.' });
  } catch (error) {
    console.log(error);

    return response.status(200).json({
      message: 'Error while performing updates on an acquisition request.',
      error,
    });
  }
});

/**
 * @openapi
 * /api/v1/offers/acquire/accept/requester:
 *   post:
 *     description: Accept a offer acquisition request.
 *     tags: [Offers]
 *     produces:
 *       - application/json
 *     security:
 *       - Bearer: []
 *     responses:
 *       200:
 *         description: Returns the accepted offer acquisition request's data.
 *       401:
 *         description: Returns "Unauthorized".
 */
router.post('/accept/requester', async (request, response) => {
  let { body, user } = request;

  const acquisitionRequestFound = await AcquisitionRequest.findOne({
    _id: body.id,
  });

  if (!acquisitionRequestFound)
    return response.status(200).json({
      message: 'Acquisition request not found.',
      error: 'acquisition-request-not-found',
    });

  const offererFound = await User.findOne({
    _id: acquisitionRequestFound.offerer,
  });
  const requesterFound = await User.findOne({
    _id: acquisitionRequestFound.requester,
  });

  try {
    const offererStockFound = await Stock.findOne({
      _id: acquisitionRequestFound.stockId,
    });

    if (!offererStockFound)
      return response.status(200).json({
        message: 'Offerer stock not found.',
        error: 'offerer-stock-not-found',
      });

    const offererMaterialFound = await Material.findOne({
      owner: offererFound.phoneNumber,
      type: offererStockFound.stockType,
    });
    const requesterMaterialFound = await Material.findOne({
      owner: requesterFound.phoneNumber,
      type: offererStockFound.stockType,
    });

    // If adding to existing stock
    if (body.addingTo === 'existing') {
      await Stock.updateOne(
        { _id: acquisitionRequestFound.stockId },
        {
          stockWeight:
            parseFloat(offererStockFound.stockWeight) -
            parseFloat(acquisitionRequestFound.weight),
          stockValue:
            (parseFloat(offererStockFound.stockWeight) -
              parseFloat(acquisitionRequestFound.weight)) *
            parseFloat(offererMaterialFound.value),
        }
      );

      const requesterStockFound = await Stock.findOne({
        _id: body.selectedStock,
      });

      if (!requesterStockFound)
        return response.status(200).json({
          message: 'Requester stock not found.',
          error: 'requester-stock-not-found',
        });

      await Stock.updateOne(
        { _id: body.selectedStock },
        {
          stockWeight:
            parseFloat(requesterStockFound.stockWeight) +
            parseFloat(acquisitionRequestFound.weight),
          stockValue:
            (parseFloat(requesterStockFound.stockWeight) +
              parseFloat(acquisitionRequestFound.weight)) *
            parseFloat(requesterMaterialFound.value),
        }
      );

      await AcquisitionRequest.deleteOne({ _id: body.id });

      const newInboxItem = new Inbox({
        sender: {
          ...requesterFound.toJSON(),
          password: undefined,
        },
        recipient: offererFound.phoneNumber,
        title: `Acquisition Accepted: ${acquisitionRequestFound.stockName}`,
        content: `Hello ${
          offererFound.userType === 'standard'
            ? `${offererFound.firstName} ${offererFound.lastName}`
            : offererFound.businessName
        },\n<br />I would like to inform you that my request for <span class="font-semibold">${
          acquisitionRequestFound.weight
        } kg</span> of your ${
          acquisitionRequestFound.stockName
        } stock has been accepted.\n<br />Best Regards,\n${
          requesterFound.userType === 'standard'
            ? `${requesterFound.firstName} ${requesterFound.lastName}`
            : requesterFound.businessName
        }`,
        attachments: [],
      });

      newInboxItem.save();

      return response.status(200).json({ message: 'Acquisiton accept sent.' });
    }
    // If Creating new stock
    else {
      await Stock.updateOne(
        { _id: acquisitionRequestFound.stockId },
        {
          stockWeight:
            offererStockFound.stockWeight - acquisitionRequestFound.weight,
          stockValue:
            (offererStockFound.stockWeight - acquisitionRequestFound.weight) *
            offererMaterialFound.value,
        }
      );

      const newData = offererStockFound.toJSON();

      delete newData._id;
      delete newData.__v;

      newData.owner = user.phoneNumber;
      newData.stockWeight = acquisitionRequestFound.weight;
      newData.stockValue = newData.stockWeight * requesterMaterialFound.value;

      const newStock = new Stock(newData);

      newStock.save();

      await AcquisitionRequest.deleteOne({ _id: body.id });

      const newInboxItem = new Inbox({
        sender: {
          ...requesterFound.toJSON(),
          password: undefined,
        },
        recipient: offererFound.phoneNumber,
        title: `Acquisition Accepted: ${acquisitionRequestFound.stockName}`,
        content: `Hello ${
          offererFound.userType === 'standard'
            ? `${offererFound.firstName} ${offererFound.lastName}`
            : offererFound.businessName
        },\n<br />I would like to inform you that my request for <span class="font-semibold">${
          acquisitionRequestFound.weight
        } kg</span> of your ${
          acquisitionRequestFound.stockName
        } stock has been accepted.\n<br />Best Regards,\n${
          requesterFound.userType === 'standard'
            ? `${requesterFound.firstName} ${requesterFound.lastName}`
            : requesterFound.businessName
        }`,
        attachments: [],
      });

      newInboxItem.save();

      return response.status(200).json({ message: 'Acquisiton accept sent.' });
    }
  } catch (error) {
    console.log(error);

    return response.status(200).json({
      message: 'Error while performing updates on an acquisition request.',
      error,
    });
  }
});

/**
 * @openapi
 * /api/v1/offers/acquire/reject/offerer:
 *   post:
 *     description: Reject a offer acquisition request.
 *     tags: [Offers]
 *     produces:
 *       - application/json
 *     security:
 *       - Bearer: []
 *     responses:
 *       200:
 *         description: Returns the offer acquisition request's rejection data.
 *       401:
 *         description: Returns "Unauthorized".
 */
router.post('/reject/offerer', async (request, response) => {
  let { body, user } = request;

  const acquisitionRequestFound = await AcquisitionRequest.findOne({
    _id: body.id,
  });

  if (!acquisitionRequestFound)
    return response.status(200).json({
      message: 'Acquisition request not found.',
      error: 'acquisition-request-not-found',
    });

  const offererFound = await User.findOne({
    _id: acquisitionRequestFound.offerer,
  });
  const requesterFound = await User.findOne({
    _id: acquisitionRequestFound.requester,
  });

  try {
    await AcquisitionRequest.deleteOne({ _id: body.id });

    const newInboxItem = new Inbox({
      sender: {
        ...offererFound.toJSON(),
        password: undefined,
      },
      recipient: requesterFound.phoneNumber,
      title: `Acquisition Rejected: ${acquisitionRequestFound.stockName}`,
      content: `Hello ${
        requesterFound.userType === 'standard'
          ? `${requesterFound.firstName} ${requesterFound.lastName}`
          : requesterFound.businessName
      },\n<br />I would like to inform you that your request for <span class="font-semibold">${
        acquisitionRequestFound.weight
      } kg</span> of my ${
        acquisitionRequestFound.stockName
      } stock has been rejected.\n<br /><span class="font-semibold">Reason:</span> ${
        body.reason
      }\n<br />Best Regards,\n${
        offererFound.userType === 'standard'
          ? `${offererFound.firstName} ${offererFound.lastName}`
          : offererFound.businessName
      }`,
      attachments: [],
    });

    newInboxItem.save();

    return response
      .status(200)
      .json({ message: 'Acquisiton request rejection sent.' });
  } catch (error) {
    console.log(error);

    return response.status(200).json({
      message: 'Error while performing updates on an acquisition request.',
      error,
    });
  }
});

/**
 * @openapi
 * /api/v1/offers/acquire/reject/requester:
 *   post:
 *     description: Reject a offer acquisition request.
 *     tags: [Offers]
 *     produces:
 *       - application/json
 *     security:
 *       - Bearer: []
 *     responses:
 *       200:
 *         description: Returns the offer acquisition request's rejection data.
 *       401:
 *         description: Returns "Unauthorized".
 */
router.post('/reject/requester', async (request, response) => {
  let { body, user } = request;

  const acquisitionRequestFound = await AcquisitionRequest.findOne({
    _id: body.id,
  });

  if (!acquisitionRequestFound)
    return response.status(200).json({
      message: 'Acquisition request not found.',
      error: 'acquisition-request-not-found',
    });

  const offererFound = await User.findOne({
    _id: acquisitionRequestFound.offerer,
  });
  const requesterFound = await User.findOne({
    _id: acquisitionRequestFound.requester,
  });

  try {
    await AcquisitionRequest.deleteOne({ _id: body.id });

    const newInboxItem = new Inbox({
      sender: {
        ...requesterFound.toJSON(),
        password: undefined,
      },
      recipient: offererFound.phoneNumber,
      title: `Acquisition Rejected: ${acquisitionRequestFound.stockName}`,
      content: `Hello ${
        offererFound.userType === 'standard'
          ? `${offererFound.firstName} ${offererFound.lastName}`
          : offererFound.businessName
      },\n<br />I would like to inform you that my request for <span class="font-semibold">${
        acquisitionRequestFound.weight
      } kg</span> of your ${
        acquisitionRequestFound.stockName
      } stock has been rejected.\n<br /><span class="font-semibold">Reason:</span> ${
        body.reason
      }\n<br />Best Regards,\n${
        requesterFound.userType === 'standard'
          ? `${requesterFound.firstName} ${requesterFound.lastName}`
          : requesterFound.businessName
      }`,
      attachments: [],
    });

    newInboxItem.save();

    return response
      .status(200)
      .json({ message: 'Acquisiton request rejection sent.' });
  } catch (error) {
    console.log(error);

    return response.status(200).json({
      message: 'Error while performing updates on an acquisition request.',
      error,
    });
  }
});

module.exports = router;
