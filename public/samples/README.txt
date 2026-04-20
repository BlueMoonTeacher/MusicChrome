교육망 등에서 외부 CDN이 막힐 때, MusyngKite MP3를 이 폴더에 미러링할 수 있습니다.

폴더 구조 (예):
  musyng/
    C4.mp3
    Db4.mp3
    ...

빌드 시 환경 변수 VITE_LOCAL_SAMPLES=1 을 설정하면 앱이
  {사이트 BASE_URL}/samples/musyng/
에서 MP3를 불러옵니다.
