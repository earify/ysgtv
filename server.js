const express = require('express');
const axios = require('axios');
const NodeCache = require('node-cache');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const config = require('./config'); // config.js에서 API 키들 export

const app = express();
const cache = new NodeCache();

// 영상 관련 상수 (이제 사진 슬라이드 쇼로 대체할 예정)
const videoPath = '영상파일.mp4';  // 기존 변수 (사용하지 않음)

// 사진 폴더 경로
const photosFolder = path.join(__dirname, 'photos');
const NX = 73;
const NY = 103;

// 정적 파일 제공
app.use(express.static(path.join(__dirname, 'public')));
// photos 폴더도 정적 파일로 제공 (예: /photos/1_1500.png)
app.use('/photos', express.static(photosFolder));

// 인덱스 라우트
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/**
 * 이미지 목록 라우트 (/image_list)
 * - photos 폴더 내 파일들을 읽어 파일 이름에서 순서와 표시 시간을 추출하고, 순서대로 정렬하여 JSON으로 반환
 */
app.get('/image_list', (req, res) => {
  fs.readdir(photosFolder, (err, files) => {
    if (err) {
      console.error("사진 폴더 읽기 오류:", err);
      return res.status(500).json({ error: '사진 폴더를 읽지 못했습니다.' });
    }
    // 이미지 파일 확장자 필터 (png, jpg, jpeg)
    const imageFiles = files.filter(file => /\.(png|jpe?g)$/i.test(file));

    // 파일 이름 형식: {order}_{duration}.{ext}
    const images = imageFiles.map(file => {
      const [orderPart, durationPartWithExt] = file.split('_');
      const [durationStr] = durationPartWithExt.split('.');
      return {
        order: parseInt(orderPart, 10),
        duration: parseInt(durationStr, 10), // ms 단위
        url: `/photos/${file}`
      };
    });

    // 순서대로 정렬
    images.sort((a, b) => a.order - b.order);
    res.json(images);
  });
});

/**
 * 날씨 및 급식 데이터 라우트 (/weather_data)
 * 기존 코드 그대로, 외부 API 호출 후 가공하여 JSON 반환 (캐싱 10분)
 */
app.get('/weather_data', async (req, res) => {
  const cached = cache.get('weather_data');
  if (cached) {
    return res.json(cached);
  }

  const now = new Date();
  const pad = (num) => num.toString().padStart(2, '0');
  const base_date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const hour = now.getHours();
  const minute = now.getMinutes();
  const current_time = `${pad(hour)}${pad(minute)}`;

  // 모든 유효 시간 목록 생성: 00, 30씩 24시간
  let valid_times = [];
  for (let h = 0; h < 24; h++) {
    valid_times.push(`${pad(h)}00`);
    valid_times.push(`${pad(h)}30`);
  }
  valid_times.sort();  // 문자열 정렬, 결과: "0000", "0030", ..., "2330"

  // 현재 시간 이하의 가장 큰 valid_time 선택
  let base_time = valid_times[0];
  for (const t of valid_times) {
    if (t <= current_time) {
      base_time = t;
    }
  }

  // 날짜 조정: 만약 최신 base_time이 자정 이전이라면 어제의 데이터를 사용할 수도 있음 (필요시 구현)
  // 예시: base_time이 너무 늦은 경우에 어제로 조정하는 로직 (원래 코드 참고)
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayStr = `${yesterday.getFullYear()}${pad(yesterday.getMonth() + 1)}${pad(yesterday.getDate())}`;
  let base_date_final = base_date;
  // 예시 조건: 만약 base_time이 2330 이상인데 오늘 날짜가 어제보다 크면 어제로 설정 (필요한 경우 조정)
  if (base_time > '2330' && parseInt(base_date) > parseInt(yesterdayStr)) {
    base_date_final = yesterdayStr;
  }

  console.log("날씨 API 요청 파라미터:", {
    base_date: base_date_final,
    base_time: base_time,
    nx: 73,
    ny: 103
  });

  // 이후 나머지 날씨 API 호출 및 데이터 가공 로직은 그대로 유지

  let current_weather = { temp: '정보 없음', emoji: '❓' };
  let hourly_forecast = [];
  for (let i = 1; i <= 5; i++) {
    const future = new Date(now.getTime() + i * 60 * 60 * 1000);
    hourly_forecast.push({
      time: `${pad(future.getHours())}00`,
      temp: '정보 없음',
      emoji: '❓'
    });
  }

  // HTTPS 엔드포인트 사용
  const weather_url = 'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtFcst';
  const weather_params = {
    serviceKey: config.WEATHER_SERVICE_KEY,
    numOfRows: '60',
    pageNo: '1',
    dataType: 'JSON',
    base_date: base_date_final,
    base_time: base_time,
    nx: 73,
    ny: 103
  };

  const sky_map = { '1': '☀️', '3': '⛅', '4': '☁️' };

  try {
    const weatherResponse = await axios.get(weather_url, { params: weather_params, timeout: 10000 });
    console.log("날씨 API 응답:", weatherResponse.data);
    const weatherData = weatherResponse.data;
    if (
      weatherData.response &&
      weatherData.response.header &&
      weatherData.response.header.resultCode === '00'
    ) {
      const items = weatherData.response.body.items.item;
      const forecast_times = hourly_forecast.map(f => f.time);

      items.forEach(item => {
        const fcst_time = item.fcstTime;
        const category = item.category;
        const fcst_value = item.fcstValue;

        if (fcst_time === forecast_times[0] && current_weather.temp === '정보 없음') {
          if (category === 'T1H') {
            current_weather.temp = fcst_value + "℃";
          } else if (category === 'SKY') {
            current_weather.emoji = sky_map[fcst_value] || '❓';
          }
        }

        hourly_forecast.forEach((forecast, index) => {
          if (fcst_time === forecast.time) {
            if (category === 'T1H') {
              hourly_forecast[index].temp = `${fcst_value}℃`;
            } else if (category === 'SKY') {
              hourly_forecast[index].emoji = sky_map[fcst_value] || '❓';
            }
          }
        });
      });
    } else {
      console.warn("날씨 API 응답 오류", weatherData.response ? weatherData.response.header : "");
    }
  } catch (error) {
    console.error("날씨 API 요청 실패:", error);
  }

  // 급식 API 호출 등 나머지 로직은 그대로 진행

  let today_date = base_date;
  let meal_code, meal_name;
  if (hour < 7 || (hour === 7 && minute < 40)) {
    meal_code = '1';
    meal_name = '조식';
  } else if (hour < 13 || (hour === 13 && minute < 50)) {
    meal_code = '2';
    meal_name = '중식';
  } else if (hour < 18 || (hour === 18 && minute < 50)) {
    meal_code = '3';
    meal_name = '석식';
  } else {
    meal_code = '1';
    meal_name = '다음 날 조식';
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    today_date = `${tomorrow.getFullYear()}${pad(tomorrow.getMonth() + 1)}${pad(tomorrow.getDate())}`;
  }

  const neis_url = 'https://open.neis.go.kr/hub/mealServiceDietInfo';
  const neis_params = {
    KEY: config.NEIS_API_KEY,
    Type: 'json',
    ATPT_OFCDC_SC_CODE: 'Q10',
    SD_SCHUL_CODE: '8490058',
    MMEAL_SC_CODE: meal_code,
    MLSV_YMD: today_date
  };

  let lunch_menu;
  try {
    const neisResponse = await axios.get(neis_url, { params: neis_params, timeout: 10000 });
    const neisData = neisResponse.data;
    if (neisData.mealServiceDietInfo && neisData.mealServiceDietInfo.length > 1) {
      let raw_menu = neisData.mealServiceDietInfo[1].row[0].DDISH_NM;
      raw_menu = raw_menu.replace(/<br\/?>/g, '\n').split('\n');
      lunch_menu = {
        meal_type: meal_name,
        menu: raw_menu.filter(item => item.trim()).map(item => item.replace(/\s*\(\d+(\.\d+)*\)/, '').trim())
      };
    } else {
      lunch_menu = { meal_type: meal_name, menu: ['급식 정보 없음'] };
    }
  } catch (error) {
    console.error("급식 API 요청 실패:", error);
    lunch_menu = { meal_type: meal_name, menu: ['급식 API 요청 실패'] };
  }

  const responseData = {
    current_weather,
    hourly_forecast,
    lunch_menu
  };

  cache.set('weather_data', responseData, 600);
  res.json(responseData);
});

const PORT = 5000;
app.listen(PORT, () => {
  console.log(`서버 실행 중: http://localhost:${PORT}`);
});
