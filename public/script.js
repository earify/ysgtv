// 전체화면 전환 함수
function enterFullscreen() {
  const elem = document.documentElement;
  if (elem.requestFullscreen) {
    elem.requestFullscreen();
  } else if (elem.webkitRequestFullscreen) {
    elem.webkitRequestFullscreen();
  } else if (elem.msRequestFullscreen) {
    elem.msRequestFullscreen();
  }
}

document.addEventListener("DOMContentLoaded", function() {
  document.getElementById("fullscreen-button").addEventListener("click", enterFullscreen);
});

// 현재 시간 업데이트
function updateTime() {
  const now = new Date();
  const datePart = now.getFullYear() + '/' + ('0' + (now.getMonth() + 1)).slice(-2) + '/' + ('0' + now.getDate()).slice(-2);
  const timePart = ('0' + now.getHours()).slice(-2) + ' : ' + ('0' + now.getMinutes()).slice(-2) + ' : ' + ('0' + now.getSeconds()).slice(-2);
  document.getElementById('current-time').innerHTML = datePart + '<br>' + timePart;
}
setInterval(updateTime, 1000);
updateTime();

// 날씨 데이터 가져오기
function fetchWeatherData() {
  fetch('/weather_data')
    .then(response => response.json())
    .then(data => {
      const weatherDiv = document.getElementById('hourly-forecast');
      weatherDiv.innerHTML = '<h3>날씨</h3>';
      if (data.error) {
        weatherDiv.innerHTML += '<p>' + data.error + '</p>';
        document.getElementById('lunch-menu').innerHTML = '';
        return;
      }
      const currentP = document.createElement('p');
      currentP.innerText = `현재 | ${data.current_weather.temp} ${data.current_weather.emoji}`;
      weatherDiv.appendChild(currentP);
      data.hourly_forecast.forEach(item => {
        const p = document.createElement('p');
        p.innerText = `${item.time.slice(0,2)} : ${item.time.slice(2)} | ${item.temp} ${item.emoji}`;
        weatherDiv.appendChild(p);
      });
      const lunchDiv = document.getElementById('lunch-menu');
      lunchDiv.innerHTML = `<h3>${data.lunch_menu.meal_type}</h3>`;
      data.lunch_menu.menu.forEach(item => {
        const p = document.createElement('p');
        p.innerText = item;
        lunchDiv.appendChild(p);
      });
    })
    .catch(error => {
      console.error('Error fetching data:', error);
      const weatherDiv = document.getElementById('hourly-forecast');
      weatherDiv.innerHTML = '<h3>날씨</h3><p>데이터 로드 실패</p>';
    });
}
setInterval(fetchWeatherData, 600000);
fetchWeatherData();

// 사진 슬라이드 쇼 구현
let photoList = [];
let currentIndex = 0;

// 사진 목록을 가져오는 함수
function fetchPhotoList() {
  fetch('/image_list')
    .then(response => response.json())
    .then(data => {
      photoList = data;
      if (photoList.length > 0) {
        currentIndex = 0;
        showNextPhoto();
      }
    })
    .catch(error => {
      console.error('사진 목록 불러오기 실패:', error);
    });
}

// 사진을 전환하는 함수
function showNextPhoto() {
  if (!photoList.length) return;
  const photoElement = document.getElementById('photo');
  const currentPhoto = photoList[currentIndex];
  photoElement.src = currentPhoto.url;
  // 지정된 시간(ms) 후에 다음 사진으로 전환
  setTimeout(() => {
    currentIndex = (currentIndex + 1) % photoList.length;
    showNextPhoto();
  }, currentPhoto.duration);
}

document.addEventListener("DOMContentLoaded", fetchPhotoList);
