const {Schema, model}= require("mongoose");

const userSchema= Schema({

    name:{type:String,required:true,trim:true},
    email:{type:String,required:true },
    passwordHash:{type:String,required:true},
    street:String,
    apartment:String,
    city:String,
    postalCode:String,
    country:String,
    phone:{type:String,required:true,trim:true},
    isAdmin:{type:Boolean,default:false},
    resetPasswordOtp:Number,
    resetPasswordOtpExpires:Date,
  
    
});



exports.User= model('User',userSchema);