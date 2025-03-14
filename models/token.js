const { Schema, model } = require("mongoose");

const tokenSchema= Schema(
    {
        userId:{type:Schema.Types.ObjectId, required:true,ref:'User'},
        refreshToken:{type:String, required:true},
        accessToken:String,
        createdAt:{type:Date,default:Date.now }
    }
);
exports.Token=model('Token',tokenSchema);
