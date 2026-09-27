function remainingTime(expiresAt) {
  let seconds = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
  const days = Math.floor(seconds / 86400); seconds %= 86400;
  const hours = Math.floor(seconds / 3600); seconds %= 3600;
  const minutes = Math.floor(seconds / 60); seconds %= 60;
  return `${days} يوم، ${hours} ساعة، ${minutes} دقيقة، ${seconds} ثانية`;
}

function mention(userId) {
  return `<@${userId}>`;
}

module.exports = { remainingTime, mention };