const { Router } = require('express');
const router = Router();
const User = require('../../models/user.model');
const Inbox = require('../../models/inbox.model');

/**
 * @openapi
 * /api/v1/inbox/compose:
 *   post:
 *     description: Create a new inbox item.
 *     tags: [Inbox]
 *     produces:
 *       - application/json
 *     parameters:
 *       - name: phoneNumber
 *         description: The inbox item's phoneNumber.
 *         type: string
 *       - name: title
 *         description: The inbox item's title.
 *         type: string
 *       - name: content
 *         description: The inbox item's content.
 *         type: string
 *       - name: attachments
 *         description: The inbox item's attachments.
 *         type: array
 *     security:
 *       - Bearer: []
 *     responses:
 *       200:
 *         description: Returns the inbox item's data.
 *       401:
 *         description: Returns "Unauthorized".
 */
router.post('/', async (request, response) => {
  let { body, user } = request;

  const senderFound = await User.findOne({ phoneNumber: user.phoneNumber });
  const recipientFound = await User.findOne({ phoneNumber: body.phoneNumber });

  if (!recipientFound) {
    return response.status(200).json({
      message:
        'Recipient not found, please use the phone number they are using.',
      error: 'recipient-not-found',
    });
  } else {
    try {
      const newInboxItem = new Inbox({
        sender: {
          ...senderFound.toJSON(),
          password: undefined,
        },
        recipient: recipientFound.phoneNumber,
        title: body.title,
        content: body.content,
        attachments: body.attachments || [],
      });

      newInboxItem.save();

      const data = newInboxItem.toJSON();

      request.io.emit(body.phoneNumber, {
        type: 'inbox-message',
        content: 'You have a new message in your inbox.',
      });

      return response.status(200).json({ data });
    } catch (error) {
      console.log(error);

      return response
        .status(200)
        .json({ message: 'Error while creating a inbox item.', error });
    }
  }
});

module.exports = router;
