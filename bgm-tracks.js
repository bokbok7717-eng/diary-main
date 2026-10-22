/* Set audioUrl to a provided, publishable audio file before enabling a track. */
(function(root){
  var tracks={
    usagi:{title:'우사기랩',artist:'우사기',cover:'assets/bgm-covers/usagi.png',audioUrl:'',youtubeUrl:'https://www.youtube.com/watch?v=S_a8LU5MYVY'},
    chiikawa:{title:'파자마 파티스의 노래',artist:'파자마 파티스',cover:'assets/bgm-covers/chiikawa.png',audioUrl:'',youtubeUrl:'https://www.youtube.com/watch?v=L82sTi_WA-k'},
    hachiware:{title:'ひとりごつ',artist:'하치와레',cover:'assets/bgm-covers/hachiware.png',audioUrl:'',youtubeUrl:'https://www.youtube.com/watch?v=-ezjz5RzOjQ'}
  };
  if(typeof module==='object'&&module.exports)module.exports=tracks;
  else root.DiaryBgmTracks=tracks;
})(typeof window==='undefined'?globalThis:window);
