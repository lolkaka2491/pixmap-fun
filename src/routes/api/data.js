/**
 * GET /data
 * returns html with:
 *  - id  (from user.getUserData())
 *  - iid (from getIIDofIP with client IP)
 */

import {
  getIPFromRequest,
  getIPv6Subnet,
} from '../../utils/ip';
import { getIIDofIP } from '../../data/sql/IPInfo';

export default async function getData(req, res, next) {
  try {
    const userdata = await req.user.getUserData();
    const { id } = userdata;

    const ip = getIPv6Subnet(getIPFromRequest(req));
    const iid = await getIIDofIP(ip);
    if (!iid) throw new Error('Could not get IID');

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>User Info</title>
        <style>
          body {
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
            font-family: sans-serif;
            background-color: #f9f9f9;
          }
          .container {
            text-align: center;
            background: #fff;
            padding: 30px 40px;
            border-radius: 12px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          }
          p {
            margin-bottom: 8px;
            font-size: 16px;
          }
          button {
            margin-bottom: 20px;
            padding: 8px 14px;
            font-size: 14px;
            cursor: pointer;
            border: none;
            border-radius: 5px;
            background-color: #007BFF;
            color: white;
            transition: background 0.2s;
          }
          button:hover {
            background-color: #0056b3;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h2>User Info</h2>
          <p><strong>ID:</strong> <span id="userId">${id}</span></p>
          <button onclick="copyText('userId', this)">Copy ID</button>
          <p><strong>IID:</strong> <span id="userIid">${iid}</span></p>
          <button onclick="copyText('userIid', this)">Copy IID</button>
        </div>

        <script>
          function copyText(elementId, btn) {
            const text = document.getElementById(elementId).innerText;
            navigator.clipboard.writeText(text).then(() => {
              const original = btn.innerText;
              btn.innerText = 'Copied!';
              btn.disabled = true;
              setTimeout(() => {
                btn.innerText = original;
                btn.disabled = false;
              }, 2000);
            });
          }
        </script>
      </body>
      </html>
    `);
  } catch (err) {
    next(err);
  }
}
