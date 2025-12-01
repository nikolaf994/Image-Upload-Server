require("dotenv").config();
const { pool } = require("../lib/db");

async function validateCompanyUser(companyName, userSecret) {
  console.log(userSecret)
  try {
    const [rows] = await pool.query(
      "SELECT companyName, uploadServerSecret FROM users WHERE companyName = ? LIMIT 1",
      [companyName]
    );

    if (rows.length === 0) {
      return {error: "User not found", success: false}; // user ne postoji
    }


    const user = rows[0];

    if (user.uploadServerSecret !== userSecret) {
      return {error: "Forbidden, wrong information provided", success: false};
    }

    // vraćamo samo potrebna polja
    return {
      success: true,
      companyName: user.companyName,
      uploadServerSecret: user.uploadServerSecret,
    };

  } catch (err) {
    console.error("DB error:", err);
    return {error: "DB error", success: false};
  }
}

module.exports = {
  validateCompanyUser,
};