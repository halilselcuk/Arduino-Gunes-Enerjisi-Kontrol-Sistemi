#include <Ethernet.h>
#include <SD.h>
#include <ArduinoJson.h> //https://github.com/bblanchon/ArduinoJson v5
#include <MD5.h> //https://github.com/tzikis/ArduinoMD5
#include <MemoryFree.h> //https://github.com/McNeight/MemoryFree

// Enter a MAC address and IP address for your controller below.
// The IP address will be dependent on your local network:
byte mac[] = { 0x00, 0xAA, 0xBB, 0xCC, 0xDA, 0x02 };
IPAddress ip(192,168,1,200); //<<< ENTER YOUR IP ADDRESS HERE!!!

// Initialize the Ethernet server library
// with the IP address and port you want to use 
// (port 80 is default for HTTP):
EthernetServer server(80);
EthernetClient client;

String _get;
String _post;
String _cookie;

//Çağrıldığında Arduino resetlenir
void(* resetFunc) (void) = 0;

//Sensörlerin ortalama değerleri
double akuV;
double panelV;
double akuA;
double panelA;

//Tahmini akü voltu
double akuTV;

//Ortalamaları almak için geçici değerler
long akuGV;
long panelGV;
long akuGA;
long panelGA;

int akuAkimSensoruSifir = 512;
int panelAkimSensoruSifir = 512;

int donguSayaci = 0;
long fanSayaci = 0;
long bahceAydinlatmaSayaci = 0;
long lavaboAydinlatmaSayaci = 0;
int sarjDurdurmaGormezdenGelmeSayisi;
int fanDurdurmaGormezdenGelmeSayisi;
int panelAkimSensoruSifirlamaSayaci;

/*
0 kalıcı kapalı
1 kalıcı açık
2 otomatik
3 geçici açık
4 geçici kapalı*/
int fanDurumu;
int bahceAydinlatmaDurumu;
int lavaboAydinlatmaDurumu;

struct Config {
	//Ayarların açıklamaları ve varsayılan değerleri loadConfiguration fonksiyonunda
	int led;
	int donguSiniri;
	double akuVoltCarpani;
	double panelVoltCarpani;
	double akuAmperCarpani;
	double panelAmperCarpani;
	double tahminiAkuGerilimiCarpani;
	double akuAkimEk;
	double sensorAmperFarki;
	double fanPanelAmperi;
	double fanAkuAmperi;
	double aydinlatmaPanelVoltu;
	double aydinlatmaAcmaAkuVoltu;
	double bahceAydinlatmaKapatmaAkuVoltu;
	double lavaboAydinlatmaKapatmaAkuVoltu;
	int geciciFanSiniri;
	int geciciAydinlatmaSiniri;
	int fanAyari;
	int bahceAydinlatmaAyari;
	int lavaboAydinlatmaAyari;
	double panelEnYuksekAkim;
	double sarjVoltu;
	double akuAkimSiniri;
	double derinDesarjVoltu;
	double panelSarjBaslangicVoltu;
	double akuSarjBaslangicVoltu;
	double panelSarjDurdurmaAmperi;
	double akuSarjDurdurmaVoltu;
	int gormezdenGelmeSayisi;
	int akuGerilimPini;
	int panelGerilimPini;
	int panelAkimPini;
	int akuAkimPini;
	int fanR;
	int bahceR;
	int lavaboR;
	int panelR;
	String corsSiteleri;
	String yonetici;
	String key;
	String kullanici;
	
};

const char *configFile = "cfg.txt";	// <- SD library uses 8.3 filenames
const char *configFileBackup = "cfg-b.txt";
Config cfg;						 	// <- global configuration object

bool pinler[54];

void setup()
{
	//Analog referansını AREF pinine bağlanan gerilime ayarlar
	analogReference(EXTERNAL);
	delay(500);
	
	Ethernet.begin(mac, ip);
	server.begin();
	delay(500);

	//SD kart 10 denemeden sonra açılamazsa Arduino'yu resetler
	int denemeSayisi = 0;
	while(!SD.begin(4))
	{
		delay(500);
		denemeSayisi++;
		if(denemeSayisi == 10) resetFunc();
	}
	
	//Ayarları SD karttan yükler
	loadConfiguration();

	//SD karttan okunan değerle Arduino'daki ledi açar
	if(cfg.led == 1)
	{
		digitalWrite(LED_BUILTIN, HIGH);
	}

	//Arduino'nun başlatıldığını loglar
	logla("Baslatildi");

	digitalWrite(cfg.fanR, HIGH);
	digitalWrite(cfg.bahceR, HIGH);
	digitalWrite(cfg.lavaboR, HIGH);
	digitalWrite(cfg.panelR, HIGH);
	
	pinMode(cfg.fanR, OUTPUT);
	pinMode(cfg.bahceR, OUTPUT);
	pinMode(cfg.lavaboR, OUTPUT);
	pinMode(cfg.panelR, OUTPUT);
	
	pinMode(cfg.akuGerilimPini, INPUT);
	pinMode(cfg.panelGerilimPini, INPUT);
	pinMode(cfg.panelAkimPini, INPUT);
	pinMode(cfg.akuAkimPini, INPUT);
	delay(1000);
	
	
	akuAkimSensorunuSifirla();
	panelAkimSensorunuSifirla();
	
	pinleriTanimla();
	
	//Kalıcı kapalı
	if(cfg.fanAyari == 0) fanDurumu = 0;
	//Kalıcı açık
	else if(cfg.fanAyari == 1)
	{
		digitalWrite(cfg.fanR, LOW);
		fanDurumu = 1;
	}
	//Otomatik
	else fanDurumu = 2;

	//Kalıcı kapalı
	if(cfg.bahceAydinlatmaAyari == 0) bahceAydinlatmaDurumu = 0;
	//Kalıcı açık
	else if(cfg.bahceAydinlatmaAyari == 1)
	{
		digitalWrite(cfg.bahceR, LOW);
		bahceAydinlatmaDurumu = 1;
	}
	//Otomatik
	else bahceAydinlatmaDurumu = 2;

	//Kalıcı kapalı
	if(cfg.lavaboAydinlatmaAyari == 0) lavaboAydinlatmaDurumu = 0;
	//Kalıcı açık
	else if(cfg.lavaboAydinlatmaAyari == 1)
	{
		digitalWrite(cfg.lavaboR, LOW);
		lavaboAydinlatmaDurumu = 1;
	}
	//Otomatik
	else lavaboAydinlatmaDurumu = 2;
}

void loop()
{
	//Sensörlerin değerleri stabil olmadığı için değerler toplanılır ve ortalaması alınır
	delay(1);
	akuGV += analogRead(cfg.akuGerilimPini);
	delay(1);
	panelGV += analogRead(cfg.panelGerilimPini);
	delay(1);
	akuGA += analogRead(cfg.akuAkimPini);
	delay(1);
	panelGA += analogRead(cfg.panelAkimPini);

	donguSayaci++;
	if(donguSayaci > cfg.donguSiniri)
	{
	 //Toplanan değerlerin ortalaması alınıyor
		akuV = akuGV / donguSayaci;
		panelV = panelGV / donguSayaci;
		akuA = akuGA / donguSayaci;
		panelA = panelGA / donguSayaci;

		//Akım sensörlerinin sıfırlarından değerler çıkartılır
		akuA -=	akuAkimSensoruSifir;
		panelA -= panelAkimSensoruSifir;

		//Volt ve amper hesaplanır
		akuV *= cfg.akuVoltCarpani;
		panelV *= cfg.panelVoltCarpani;
		akuA *= cfg.akuAmperCarpani;
		panelA *= cfg.panelAmperCarpani;

		//Döngü sayacı sıfırlanır
		donguSayaci = 0;

		//Geçici değerler sıfırlanır
		akuGV = 0;
		panelGV = 0;
		akuGA = 0;
		panelGA = 0;
	
		//Sarj durumunda tahmini akü voltu
		akuTV = akuV - (panelA * cfg.tahminiAkuGerilimiCarpani); 

		//Aşırı akım çekildiğinde sigorta açılmadan güç çıkışının durdurulması denenir
		if(akuA > cfg.akuAkimSiniri)
		{
			gucCikisiniDurdur();
			logla("Asiri akim");
		}

		//Akü gerilimi belirlenen voltun altına düştüğünde derin deşarjı önlemek için güç çıkışını durdur
		if(gucCikisi() && akuV < cfg.derinDesarjVoltu)
		{
			gucCikisiniDurdur();
			logla("Derin desarj");
		}
		
		
		//Otomatikse
		if(fanDurumu == 2)
		{
			//Panelden veya aküden fazla çekiliyorsa fanı çalıştır
			if(panelA > cfg.fanPanelAmperi || akuA > cfg.fanAkuAmperi)
			{
				digitalWrite(cfg.fanR, LOW);
				fanDurdurmaGormezdenGelmeSayisi = 0;
			}
			//Değlse
			else
			{
				fanDurdurmaGormezdenGelmeSayisi++;
				if(fanDurdurmaGormezdenGelmeSayisi > cfg.gormezdenGelmeSayisi)
				{
					digitalWrite(cfg.fanR, HIGH);
					fanDurdurmaGormezdenGelmeSayisi = 0;
				}
			}
		}
		//Geçici ayardaysa
		else if(fanDurumu > 2)
		{
			fanSayaci++;
			//Geçici ayarın sayacı dolduysa 
			if(fanSayaci > cfg.geciciFanSiniri)
			{
				//Otomatik ayara al
				fanDurumu = 2;
				
				fanSayaci = 0;
			}
		}
		
		//Otomatikse
		if(bahceAydinlatmaDurumu == 2)
		{
			//Sarj ediliyorsa
			if(digitalRead(cfg.panelR) == LOW)
			{
				//Aydınlatmayı kapat
				digitalWrite(cfg.bahceR, HIGH);
			}
			//Aydınlatma açıksa
			else if(digitalRead(cfg.bahceR) == LOW)
			{
				//Panelden güç geliyorsa veya akü yeterince dolu değilse aydınlatmayı kapat
				if(panelV > cfg.aydinlatmaPanelVoltu || akuV < cfg.bahceAydinlatmaKapatmaAkuVoltu) digitalWrite(cfg.bahceR, HIGH);
			}
			//Aydınlatma kapalıysa
			else
			{
				//Panelden güç gelmiyorsa ve akü yeterince doluysa aydınlatmayı aç
				if(panelV < cfg.aydinlatmaPanelVoltu && akuV > cfg.aydinlatmaAcmaAkuVoltu) digitalWrite(cfg.bahceR, LOW);
			}
		}
		//Geçici ayardaysa
		else if(bahceAydinlatmaDurumu > 2)
		{
			bahceAydinlatmaSayaci++;
			//Geçici ayarın sayacı dolduysa 
			if(bahceAydinlatmaSayaci > cfg.geciciAydinlatmaSiniri)
			{
				//Otomatik ayara al
				bahceAydinlatmaDurumu = 2;
				
				bahceAydinlatmaSayaci = 0;
			}
		}
		
		//Otomatikse
		if(lavaboAydinlatmaDurumu == 2)
		{
			//Sarj ediliyorsa
			if(digitalRead(cfg.panelR) == LOW)
			{
				//Aydınlatmayı kapat
				digitalWrite(cfg.lavaboR, HIGH);
			}
			//Aydınlatma açıksa
			else if(digitalRead(cfg.lavaboR) == LOW)
			{
				//Panelden güç geliyorsa veya akü yeterince dolu değilse aydınlatmayı kapat
				if(panelV > cfg.aydinlatmaPanelVoltu || akuV < cfg.lavaboAydinlatmaKapatmaAkuVoltu) digitalWrite(cfg.lavaboR, HIGH);
			}
			//Aydınlatma kapalıysa
			else
			{
				//Panelden güç gelmiyorsa ve akü yeterince doluysa aydınlatmayı aç
				if(panelV < cfg.aydinlatmaPanelVoltu && akuV > cfg.aydinlatmaAcmaAkuVoltu) digitalWrite(cfg.lavaboR, LOW);
			}
		}
		//Geçici ayardaysa
		else if(lavaboAydinlatmaDurumu > 2)
		{
			lavaboAydinlatmaSayaci++;
			//Geçici ayarın sayacı dolduysa 
			if(lavaboAydinlatmaSayaci > cfg.geciciAydinlatmaSiniri)
			{
				//Otomatik ayara al
				lavaboAydinlatmaDurumu = 2;
				
				lavaboAydinlatmaSayaci = 0;
			}
		}

		//Şarj ediliyorsa
		if(digitalRead(cfg.panelR) == LOW)
		{
			//Panelden güç gelmiyor veya akü doluysa
			if(panelA < cfg.panelSarjDurdurmaAmperi || akuTV > cfg.akuSarjDurdurmaVoltu)
			{
				sarjDurdurmaGormezdenGelmeSayisi++;
				if(sarjDurdurmaGormezdenGelmeSayisi > cfg.gormezdenGelmeSayisi)
				{
					digitalWrite(cfg.panelR, HIGH);
					sarjDurdurmaGormezdenGelmeSayisi = 0;
				}
			}
			else sarjDurdurmaGormezdenGelmeSayisi = 0;
		}
		//Şarj edilmiyorsa
		else
		{
			//Panelden güç geliyorsa ve akü dolu değilse şarjı başlat
			if(panelV > cfg.panelSarjBaslangicVoltu && akuV < cfg.akuSarjBaslangicVoltu)
			{
				digitalWrite(cfg.panelR, LOW);
			}
		}
		
		//Güç çıkışı yoksa
		if(!gucCikisi())
		{
			double baslangicAmperi = cfg.akuAkimEk * cfg.akuAmperCarpani;
			double fark = abs(akuA - baslangicAmperi);
			//Fark belirlenenden büyükse
			if(fark > cfg.sensorAmperFarki)	akuAkimSensorunuSifirla();
		}
		
		panelAkimSensoruSifirlamaSayaci++;
		//Güç girişi yoksa
		if((digitalRead(cfg.panelR) == HIGH && abs(panelA) > 0.1) || panelAkimSensoruSifirlamaSayaci > 5000)
		{
			panelAkimSensorunuSifirla();
			panelAkimSensoruSifirlamaSayaci = 0;
		}
	}
	
	//Başlangıçtaki boş değerlerin istemciye gitmesini önlemek için.
	//if(akuV == 0) return;
	
	client = server.available();
  //Gelen bağlantı varsa
	if (client) {
		boolean currentLineIsBlank = true;
		boolean isPostRequest = false;
		boolean isFilePost = false;
		String requestDetails = "";
		_get = "";
		_post = "";
		_cookie = "";
		//İstek gövdesinin toplam uzunluğu
		long contentLength = 1;
		//İstek gövdesinin alınan uzunluğu
		int recievedContent = 0;
		//İstek gövdesinin dosyalar için alınan uzunluğu
		long recievedFileContent = 0;
		//Toplam alınan karakter
		int sayac = 0;
		String yol;
		File file;
		while (client.connected()) {
			if (client.available()) {
				char c = client.read();
				//Belleğe kaydedilen her karaktere +1
				if(!isFilePost) sayac++;
				
				//Post isteğiyse. Eğer post isteğiyse isPostRequest, header'lar alındaktan sonra true olur.
				if(isPostRequest) {
					//Gelen veri SD karta yazılacaksa
					if(isFilePost)
					{
						//Dosya için alınan her karaktere +1
						recievedFileContent +=	file.print(c);
						//Alınacak veri kalmadıysa
						if(recievedFileContent >= contentLength)
						{
							file.close();
							printHeader();
							client.println("");
							client.print(recievedFileContent);
							break;
						}
					}
					else 
					{
						recievedContent++;
						_post += c;
					}
				}
				//Gelen veri header'sa
				else 
				{
					requestDetails += c;
				}
				
				//Header tamamlandıysa veya bellek fazla işgal edildiyse. Bu blok her istekte sadece bir kere çalışır.
				if(((c == '\n' && currentLineIsBlank) || sayac > 1500) && !isPostRequest)
				{
					requestDetails.replace("\n\n", "\n");
					_get = strBet(requestDetails, " ", " HTTP/1.1");
					_cookie = strBet(requestDetails, "Cookie:", "\n");
					yol = strBet(_get, "/", "?");
					
					if(yol == "null")
					{
						yol = _get.substring(1, _get.length());
					}
					
					if(
						//Giriş yapılmadan erişilebilen yollar
						(yol != "giris" && yol != "surum")
						//Giriş yapılıp yapılmadığının denetimi
						&& (cookie("key") != cfg.key
						|| !(cookie("kullanici") == cfg.yonetici || cookie("kullanici") == cfg.kullanici))
					)
					{
						printHeader();
						if(yol == "")
						{
							//Tarayıcıya sayfayı önbelleğe almasını söyle
							client.println("Cache-Control: max-age=315360000");
							client.println("Cache-Control: only-if-cached");
							//Header'ı sonlandır
							client.println();
							
							dosyaYukle("index.htm");
							break;
						}
						
						client.println("");
						if(yol == "giris.htm") dosyaYukle("giris.htm");
						else if(yol == "index2.htm") dosyaYukle("giris2.htm");
						else client.print("401");
						break;
					}
					
					//Post isteğiyse
					if(requestDetails.substring(0, 4) == "POST")
					{
						//Alınacak verinin uzunluğu
						contentLength = strBet(requestDetails, "Content-Length: ", "\n").toInt();
						//Alınacak veri varsa
						if(contentLength != 0)
						{
							_post = "&";
							isPostRequest = true;
							//Post verileri alınacağı için header tamamlandığında döngüden çıkılmasını önlemek için
							currentLineIsBlank = false;
							
							if(yol == "sd_write")
							{
								String dosyaAdi = get("dosya");
								if(dosyaAdi != "null" || get("key") != cfg.key)
								{
									if(get("overwrite") == "1" && SD.exists(dosyaAdi)) SD.remove(dosyaAdi);
									file = SD.open(dosyaAdi, FILE_WRITE);
									if(!file) 
									{
										printHeader();
										client.println("");
										client.print("dosya_acilamadi");
										file.close();
										break;
									}
									isFilePost = true;
								}
								else
								{
									printHeader();
									client.println("");
									client.print("hata");
									break;
								}
							}
						}
					}
					requestDetails = "";
				}
				//Header tamamlandıysa ve post isteği değilse 
				//veya post ise ve post için alınacak veri kalmadıysa
				//veya bellek fazla işgal edildiyse
				if (((c == '\n' && currentLineIsBlank) || recievedContent >= contentLength || sayac > 1500) && !isFilePost)
				{
					printHeader();
					
					if(yol == "giris")
					{
						String kullanici = post("kullanici");
						kullanici.toLowerCase();
						String parola = post("parola");
						String parolaMd5 = md5(parola + "203");
						if(parolaMd5 == cfg.key && (kullanici == cfg.yonetici || kullanici == cfg.kullanici))
						{
							//Bilgileri çerez olarak kaydet
							client.println("Set-Cookie: kullanici="+kullanici+"; Max-Age=315360000;");
							client.println("Set-Cookie: key="+parolaMd5+"; Max-Age=315360000;");
							if(kullanici == cfg.yonetici) client.println("Set-Cookie: yonetici=1; Max-Age=315360000;");
							//Header'ı sonlandır
							client.println();
							//Sonucu yaz
							client.print("1");
						}
						else
						{
							//Header'ı sonlandır
							client.println();
							//Sonucu yaz
							client.print("0");
						}
						break;
					}
					
					else if(yol == "")
					{
						//Tarayıcıya sayfayı önbelleğe almasını söyle
						client.println("Cache-Control: max-age=315360000");
						client.println("Cache-Control: only-if-cached");
						//Header'ı sonlandır
						client.println();
						
						dosyaYukle("index.htm");
						break;
					}
					
					//Aşağıdaki işlemlerde header'a bir şey eklenmeyeceği için header'ı burada sonlandır
					client.println();
					
					if(yol == "surum")
					{
						client.print("1.5");
					}
					
					else if(yol == "degerler")
					{														
							StaticJsonBuffer<600> jsonBuffer;
							JsonObject& degerler = jsonBuffer.createObject();
							
							degerler["akuV"] = akuV;
							degerler["panelV"] = panelV;
							degerler["akuA"] = akuA;
							degerler["panelA"] = panelA;
							degerler["akuTV"] = akuTV;

							degerler["fanDurumu"] = fanDurumu;
							degerler["bahceAydinlatmaDurumu"] = bahceAydinlatmaDurumu;
							degerler["lavaboAydinlatmaDurumu"] = lavaboAydinlatmaDurumu;
							
							//Geçici ayardaysa sayacı yaz
							if(fanDurumu > 2)
							degerler["fanSayaci"] = String(cfg.geciciFanSiniri)+"/"+String(fanSayaci);
							if(bahceAydinlatmaDurumu > 2)
							degerler["bahceAydinlatmaSayaci"] = String(cfg.geciciAydinlatmaSiniri)+"/"+String(bahceAydinlatmaSayaci);
							if(lavaboAydinlatmaDurumu > 2)
							degerler["lavaboAydinlatmaSayaci"] = String(cfg.geciciAydinlatmaSiniri)+"/"+String(lavaboAydinlatmaSayaci);

							degerler["fanR"] = digitalRead(cfg.fanR);
							degerler["bahceR"] = digitalRead(cfg.bahceR);
							degerler["lavaboR"] = digitalRead(cfg.lavaboR);
							degerler["panelR"] = digitalRead(cfg.panelR);
							
							for(int i = 0; i < sizeof(pinler); i++)
							{
								if(pinler[i] == true)
								{
									degerler["p"+String(i)] = digitalRead(i);
								}
							}
							
							//degerler["free_memory"] = "8192/" + String(freeMemory());
							
							degerler.prettyPrintTo(client);
					}
					
					else if(yol == "kalibrasyon_degerleri")
					{
						StaticJsonBuffer<600> jsonBuffer;
						JsonObject& degerler = jsonBuffer.createObject();
						degerler["akuGV"] = akuV / cfg.akuVoltCarpani;
						degerler["panelGV"] = panelV / cfg.panelVoltCarpani;
						degerler["akuGA"] = (akuA / cfg.akuAmperCarpani) + akuAkimSensoruSifir;
						degerler["panelGA"] = (panelA / cfg.panelAmperCarpani) + panelAkimSensoruSifir;
						degerler["akuAkimSensoruSifir"] = akuAkimSensoruSifir;
						degerler["panelAkimSensoruSifir"] = panelAkimSensoruSifir;
						degerler.prettyPrintTo(client);
					}
					
					else if(yol == "sd_read")
					{
						dosyaYukle(get("dosya"));
					}
					
					else if(yol == "sd_listfiles")
					{
						File root = SD.open("/");
						printDirectory(root, 0);
						root.close();
					}
					
					//Dışardan yapılan post yönlendirme saldırısını önlemek için çerezin yanında ayrıca kontrol edilir
					else if(post("key") == cfg.key)
					{
						if(yol == "parola_degistir")
						{
							String parola = post("parola");
							String eskiParola = post("eski_parola");
							if(parola == "null" || eskiParola == "null")
							{
								client.print("eksik_bilgi");
							}
							else if(md5(eskiParola + "203") != cfg.key)
							{
								client.print("yanlis_parola");
							}
							else
							{
								cfg.key = md5(parola + "203");
								client.print(updateConfig(configFile));
								updateConfig(configFileBackup);
								logla("Parola degistirildi");
							}
						}
						
						else if(yol == "kullanici_adi_degistir")
						{
							String kullanici = post("kullanici");
							kullanici.toLowerCase();
							String parola = post("parola");
							if(kullanici == "null" || parola == "null")
							{
								client.print("eksik_bilgi");
							}
							else if(md5(parola + "203") != cfg.key)
							{
								client.print("yanlis_parola");
							}
							else
							{
								cfg.kullanici = kullanici;
								client.print(updateConfig(configFile));
								updateConfig(configFileBackup);
								logla("Kullanici adi degistirildi");
							}
						}
						
						else if(yol == "yonetici_adi_degistir")
						{
							String kullanici = post("kullanici");
							kullanici.toLowerCase();
							String parola = post("parola");
							if(kullanici == "null" || parola == "null")
							{
								client.print("eksik_bilgi");
							}
							else if(md5(parola + "203") != cfg.key)
							{
								client.print("yanlis_parola");
							}
							else
							{
								cfg.yonetici = kullanici;
								client.print(updateConfig(configFile));
								updateConfig(configFileBackup);
								logla("Yonetici adi degistirildi");
							}
						}
					
						else if(yol == "digital_write")
						{
							int pin = post("pin").toInt();
							int durum = post("durum").toInt();
							if(pin != -1 && durum != -1)
							{
								digitalWrite(pin, durum);
								
								client.print("1");
							}
							else client.print("0");
						}
						
						else if(yol == "led")
						{
							if(post("durum") == "1")
							{
								digitalWrite(LED_BUILTIN, HIGH);
								client.print("1");
								cfg.led = 1;
								updateConfig(configFile);
							}
							else if(post("durum") == "0")
							{
								digitalWrite(LED_BUILTIN, LOW);
								client.print("0");
								cfg.led = 0;
								updateConfig(configFile);
							}
						}
						
						else if(yol == "fan")
						{
							String durum = post("durum");
							if(durum == "0")
							{
								//Kalıcı kapalı
								digitalWrite(cfg.fanR, HIGH);
								fanDurumu = 0;
								cfg.fanAyari = 0;
								client.print(updateConfig(configFile));
							}
							else if(durum == "1")
							{
								//Kalıcı açık
								digitalWrite(cfg.fanR, LOW);
								fanDurumu = 1;
								cfg.fanAyari = 1;
								client.print(updateConfig(configFile));
							}
							else if(durum == "2")
							{
								//Otomatik
								fanDurumu = 2;
								if(cfg.fanAyari != 2)
								{
									cfg.fanAyari = 2;
									client.print(updateConfig(configFile));
								}
								else client.println("1");
							}
							else if(durum == "3")
							{
								//Geçici açık
								digitalWrite(cfg.fanR, LOW);
								fanDurumu = 3;
								fanSayaci = 0;
								client.print("1");
							}
							else if(durum == "4")
							{
								//Geçici kapalı
								digitalWrite(cfg.fanR, HIGH);
								fanDurumu = 4;
								fanSayaci = 0;
								client.print("1");
							}
						}
						
						else if(yol == "bahce_aydinlatmasi")
						{
							String durum = post("durum");
							if(durum == "0")
							{
								//Kalıcı kapalı
								digitalWrite(cfg.bahceR, HIGH);
								bahceAydinlatmaDurumu = 0;
								cfg.bahceAydinlatmaAyari = 0;
								client.print(updateConfig(configFile));
							}
							else if(durum == "1")
							{
								//Kalıcı açık
								digitalWrite(cfg.bahceR, LOW);
								bahceAydinlatmaDurumu = 1;
								cfg.bahceAydinlatmaAyari = 1;
								client.print(updateConfig(configFile));
							}
							else if(durum == "2")
							{
								//Otomatik
								bahceAydinlatmaDurumu = 2;
								if(cfg.bahceAydinlatmaAyari != 2)
								{
									cfg.bahceAydinlatmaAyari = 2;
									client.print(updateConfig(configFile));
								}
								else client.println("1");
							}
							else if(durum == "3")
							{
								//Geçici açık
								digitalWrite(cfg.bahceR, LOW);
								bahceAydinlatmaDurumu = 3;
								bahceAydinlatmaSayaci = 0;
								client.print("1");
							}
							else if(durum == "4")
							{
								//Geçici kapalı
								digitalWrite(cfg.bahceR, HIGH);
								bahceAydinlatmaDurumu = 4;
								bahceAydinlatmaSayaci = 0;
								client.print("1");
							}
						}
						
						else if(yol == "lavabo_aydinlatmasi")
						{
							String durum = post("durum");
							if(durum == "0")
							{
								//Kalıcı kapalı
								digitalWrite(cfg.lavaboR, HIGH);
								lavaboAydinlatmaDurumu = 0;
								cfg.lavaboAydinlatmaAyari = 0;
								client.print(updateConfig(configFile));
							}
							else if(durum == "1")
							{
								//Kalıcı açık
								digitalWrite(cfg.lavaboR, LOW);
								lavaboAydinlatmaDurumu = 1;
								cfg.lavaboAydinlatmaAyari = 1;
								client.print(updateConfig(configFile));
							}
							else if(durum == "2")
							{
								//Otomatik
								lavaboAydinlatmaDurumu = 2;
								if(cfg.lavaboAydinlatmaAyari != 2)
								{
									cfg.lavaboAydinlatmaAyari = 2;
									client.print(updateConfig(configFile));
								}
								else client.println("1");
							}
							else if(durum == "3")
							{
								//Geçici açık
								digitalWrite(cfg.lavaboR, LOW);
								lavaboAydinlatmaDurumu = 3;
								lavaboAydinlatmaSayaci = 0;
								client.print("1");
							}
							else if(durum == "4")
							{
								//Geçici kapalı
								digitalWrite(cfg.lavaboR, HIGH);
								lavaboAydinlatmaDurumu = 4;
								lavaboAydinlatmaSayaci = 0;
								client.print("1");
							}
						}

						else if(yol == "aku_sensorunu_sifirla")
						{
							akuAkimSensorunuSifirla();
							client.println(akuAkimSensoruSifir);
						}

						else if(yol == "panel_sensorunu_sifirla")
						{
							panelAkimSensorunuSifirla();
							client.println(panelAkimSensoruSifir);
						}
						
						else if(yol == "reset")
						{
							client.print("1");
							delay(1);
							client.stop();
							
							resetFunc();
						}

						else if(yol == "sd_remove")
						{
							SD.remove(post("filename"));
							client.print("1");
						}
						
						else if(yol == "pinleri_yeniden_tanimla")
						{
							client.print(pinleriTanimla());
						}
						
						else if(yol == "ayar")
						{
							String ad = post("ad");
							String deger = post("deger");
							if(ad != "null" && deger != "null")
							{
								if(ad == "akuVoltCarpani")
								{
									cfg.akuVoltCarpani = deger.toDouble();
								}
								else if(ad == "panelVoltCarpani")
								{
									cfg.panelVoltCarpani = deger.toDouble();
								}
								else if(ad == "akuAmperCarpani")
								{
									cfg.akuAmperCarpani = deger.toDouble();
								}
								else if(ad == "panelAmperCarpani")
								{
									cfg.panelAmperCarpani = deger.toDouble();
								}
								else if(ad == "tahminiAkuGerilimiCarpani")
								{
									cfg.tahminiAkuGerilimiCarpani = deger.toDouble();
								}
								else if(ad == "akuAkimEk")
								{
									cfg.akuAkimEk = deger.toDouble();
								}
								else if(ad == "sensorAmperFarki")
								{
									cfg.sensorAmperFarki = deger.toDouble();
								}
								else if(ad == "fanPanelAmperi")
								{
									cfg.fanPanelAmperi = deger.toDouble();
								}
								else if(ad == "fanAkuAmperi")
								{
									cfg.fanAkuAmperi = deger.toDouble();
								}
								else if(ad == "aydinlatmaPanelVoltu")
								{
									cfg.aydinlatmaPanelVoltu = deger.toDouble();
								}
								else if(ad == "aydinlatmaAcmaAkuVoltu")
								{
									cfg.aydinlatmaAcmaAkuVoltu = deger.toDouble();
								}
								else if(ad == "bahceAydinlatmaKapatmaAkuVoltu")
								{
									cfg.bahceAydinlatmaKapatmaAkuVoltu = deger.toDouble();
								}
								else if(ad == "lavaboAydinlatmaKapatmaAkuVoltu")
								{
									cfg.lavaboAydinlatmaKapatmaAkuVoltu = deger.toDouble();
								}
								else if(ad == "donguSiniri")
								{
									cfg.donguSiniri = deger.toInt();
								}
								else if(ad == "geciciFanSiniri")
								{
									cfg.geciciFanSiniri = deger.toInt();
								}
								else if(ad == "geciciAydinlatmaSiniri")
								{
									cfg.geciciAydinlatmaSiniri = deger.toInt();
								}
								else if(ad == "panelEnYuksekAkim")
								{
									cfg.panelEnYuksekAkim = deger.toDouble();
								}
								else if(ad == "sarjVoltu")
								{
									cfg.sarjVoltu = deger.toDouble();
								}
								else if(ad == "akuAkimSiniri")
								{
									cfg.akuAkimSiniri = deger.toDouble();
								}
								else if(ad == "derinDesarjVoltu")
								{
									cfg.derinDesarjVoltu = deger.toDouble();
								}
								else if(ad == "panelSarjBaslangicVoltu")
								{
									cfg.panelSarjBaslangicVoltu = deger.toDouble();
								}
								else if(ad == "akuSarjBaslangicVoltu")
								{
									cfg.akuSarjBaslangicVoltu = deger.toDouble();
								}
								else if(ad == "panelSarjDurdurmaAmperi")
								{
									cfg.panelSarjDurdurmaAmperi = deger.toDouble();
								}
								else if(ad == "akuSarjDurdurmaVoltu")
								{
									cfg.akuSarjDurdurmaVoltu = deger.toDouble();
								}
								else if(ad == "gormezdenGelmeSayisi")
								{
									cfg.gormezdenGelmeSayisi = deger.toInt();
								}
								else if(ad == "akuGerilimPini")
								{
									cfg.akuGerilimPini = deger.toInt();
								}
								else if(ad == "panelGerilimPini")
								{
									cfg.panelGerilimPini = deger.toInt();
								}
								else if(ad == "panelAkimPini")
								{
									cfg.panelAkimPini = deger.toInt();
								}
								else if(ad == "akuAkimPini")
								{
									cfg.akuAkimPini = deger.toInt();
								}
								else if(ad == "fanR")
								{
									cfg.fanR = deger.toInt();
								}
								else if(ad == "bahceR")
								{
									cfg.bahceR = deger.toInt();
								}
								else if(ad == "lavaboR")
								{
									cfg.lavaboR = deger.toInt();
								}
								else if(ad == "panelR")
								{
									cfg.panelR = deger.toInt();
								}
								else if(ad == "corsSiteleri")
								{
									cfg.corsSiteleri = deger;
								}
								else 
								{
									client.print("ayar_bulunamadi");
									break;
								}
								
								client.print(updateConfig(configFile));
								updateConfig(configFileBackup);
							}
							break;
						}
						else client.print("404");
					}
					/* Hata ayıklama için
					
					else if(yol == "analog_read")
					{
						int pin = get("pin").toInt();
						if(pin != -1) client.print(analogRead(pin));
					}
					
					else if(yol == "digital_read")
					{
						int pin = get("pin").toInt();
						if(pin != -1) client.print(digitalRead(pin));
					}
					
					else if(yol == "digital_write")
					{
						int pin = get("pin").toInt();
						if(pin != -1)
						{
							if(get("deger") == "high") digitalWrite(pin, HIGH);
							else digitalWrite(pin, LOW);
							
							client.print("1");
						}
					}
					
					else if(yol == "analog_write")
					{
						int pin = get("pin").toInt();
						int deger = get("deger").toInt();
						if(pin != -1 && deger != -1)
						{
							analogWrite(pin, deger);
							client.println("1");
						}
					}
					
					else if(yol == "post_test")
					{
						client.println(_post);
						client.println("<br>");
						client.println(contentLength);
						client.println("<br>");
						client.println(post(get("ad")));
					}
					
					else if(yol == "cookie_test")
					{
						client.println(_cookie);
						client.println("<br>");
						client.println(cookie(get("ad")));
					}
					*/
					else if(SD.exists(yol))
					{
						dosyaYukle(yol);
					}
					else client.print("404");
					
					break;
				}
				if (c == '\n') {
					// you're starting a new line
					currentLineIsBlank = true;
				} 
				else if (c != '\r') {
					// you've gotten a character on the current line
					currentLineIsBlank = false;
				}	
			}
		}
		// give the web browser time to receive the data
		delay(5);
		// close the connection:
		client.stop();
	}
}

String strBet(String str, String str1, String str2)
{
	int baslangic = str.indexOf(str1, 0);
	int bitis = str.indexOf(str2, baslangic + str1.length());
	if(bitis == -1 || baslangic == -1) return "null";
	return str.substring(baslangic + str1.length(), bitis);
}

String get(String ad)
{
	String s = "&"+ad+"=";
	int baslangic = _get.indexOf(s, 0);
	if(baslangic == -1)
	{
		s = "?"+ad+"=";
		baslangic = _get.indexOf(s, 0);
	}
	
	int bitis = _get.length();
	int bslOp = _get.indexOf("&", baslangic + s.length());
	
	if(bslOp != -1)
	bitis = bslOp;
	
	if(bitis == -1 || baslangic == -1) return "null";
	return urldecode(_get.substring(baslangic + s.length(), bitis));
}

String post(String ad)
{
	String s = "&"+ad+"=";
	int baslangic = _post.indexOf(s, 0);
	
	int bitis = _post.length();
	int bslOp = _post.indexOf("&", baslangic + s.length());
	
	if(bslOp != -1)
	bitis = bslOp;
	
	if(bitis == -1 || baslangic == -1) return "null";
	return _post.substring(baslangic + s.length(), bitis);
}

String cookie(String ad)
{
	String s = " "+ad+"=";
	int baslangic = _cookie.indexOf(s, 0);
	
	int bitis = _cookie.length() -1;
	int bslOp = _cookie.indexOf(";", baslangic + s.length());
	
	if(bslOp != -1)
	bitis = bslOp;
	
	if(bitis == -1 || baslangic == -1) return "null";
	return _cookie.substring(baslangic + s.length(), bitis);
}

void dosyaYukle(String dosyaAdi)
{
	delay(1);
	File dosya = SD.open(dosyaAdi);
	
	if(dosya)
	{
		int sayac = 0;
		long sayac2 = 0;
		char buf[1000];
		int size = sizeof(buf) - 1;
		while(dosya.available())
		{
			buf[sayac] = (char)dosya.read();
			sayac++;
			sayac2++;
			//Buffer dolduysa
			if(sayac >= size)
			{
				//Diziyi sonlandır
				buf[sayac] = '\0';
				//Verileri istemciye gönder
				client.print(buf);
				client.flush();
				//İstemcinin verileri almasını bekle
				delay(1);
				
				sayac = 0;
			}
			//Döngü buga girdiğinde çıkabilmesi için
			if(sayac2 > 150000)
			{
				dosya.close();
				return;
			}
		}
		//Buffer dolmadan döngü sonlandıysa
		if(sayac != 0)
		{
			buf[sayac] = '\0';
			client.print(buf);
		}
		dosya.close();
	}
	else client.print("dosya_bulunamadi");
}

bool logla(String text)
{
	delay(1);
	File file;
	file = SD.open("loglar.txt", FILE_WRITE);

	if(file) 
	{
		file.println(text);
		file.close();
		
		return true;
	}
	else return false;
}

void printHeader()
{
	client.println("HTTP/1.1 200 OK");
	client.println("Access-Control-Allow-Origin: " + cfg.corsSiteleri);
	client.println("Access-Control-Allow-Credentials: true");
	client.println("Content-Type: text/html");
}

void gucCikisiniDurdur()
{
	//Güç çıkış rölelerini kapatır
	digitalWrite(cfg.fanR, HIGH);
	digitalWrite(cfg.bahceR, HIGH);
	digitalWrite(cfg.lavaboR, HIGH);
	for(int i = 0; i < sizeof(pinler); i++)
	{
		if(pinler[i] == true)
		{
			digitalWrite(i, HIGH);
		}
	}
}

bool gucCikisi()
{
	//Güç çıkışı varsa true döndürür
	if(digitalRead(cfg.fanR) == LOW) return true;
	if(digitalRead(cfg.bahceR) == LOW) return true;
	if(digitalRead(cfg.lavaboR) == LOW) return true;
	for(int i = 0; i < sizeof(pinler); i++)
	{
		if(pinler[i] == true)
		{
			if(digitalRead(i) == LOW) return true;
		}
	}
	return false;
}

void akuAkimSensorunuSifirla()
{
	gucCikisiniDurdur();
	delay(1000);
	long toplam = 0;
	for(int i = 0; i < 100; i++)
	{
		toplam += analogRead(cfg.akuAkimPini);
		delay(1);
	}
	akuAkimSensoruSifir = int(toplam / 100);

	//Arduino'nun çektiği akım hesaplanan sıfırdan çıkartılır
	//Buradaki akımın birimi, amper değil analog değerdir
	akuAkimSensoruSifir -= cfg.akuAkimEk;
}

void panelAkimSensorunuSifirla()
{
	digitalWrite(cfg.panelR, HIGH);
	delay(1000);
	long toplam = 0;
	for(int i = 0; i < 100; i++)
	{
		toplam += analogRead(cfg.panelAkimPini);
		delay(1);
	}
	panelAkimSensoruSifir = int(toplam / 100);
}

int pinleriTanimla()
{
	//Dizinin bütün elemanlarını false yapar
	memset(pinler, 0, sizeof(pinler));
	
	File file = SD.open("pinler.txt");
	if(file)
	{
		String tmpS;
		char tmpC;
		while(file.available()) 
		{
			tmpC = (char)file.read();
			if(tmpC == ',') 
			{
				int i = tmpS.toInt();
				if(i < sizeof(pinler) && i > -1)
				{
					digitalWrite(i, HIGH);
					pinMode(i, OUTPUT);
					delay(10);
					pinler[i] = true;
				}
				tmpS = "";
			}
			else tmpS += tmpC; //
		}
		file.close();
		return 1;
	}
	else return 0;
}

// Loads the configuration from a file
void loadConfiguration() {
	delay(1);
	// Open file for reading
	File file = SD.open(configFile);
	if(file.size() == 0) file = SD.open(configFileBackup);
	// Allocate the memory pool on the stack.
	// Don't forget to change the capacity to match your JSON document.
	// Use arduinojson.org/assistant to compute the capacity.
	StaticJsonBuffer<1500> jsonBuffer;

	// Parse the root object
	JsonObject &root = jsonBuffer.parseObject(file);
	
	//Arduino'daki ledin durumu
	cfg.led = root["led"] | 0;
	
	//Sensörlerin hesaplanması için kaç örneğin alınacağı
	cfg.donguSiniri = root["dSiniri"] | 100;
	
	//Sensör çarpanları
	cfg.panelVoltCarpani = root["panelVC"] | 0.053385;
	cfg.akuVoltCarpani = root["akuVC"] | 0.0239;
	cfg.akuAmperCarpani = root["akuAC"] | 0.047;
	cfg.panelAmperCarpani = root["panelAC"] | 0.051;
	cfg.tahminiAkuGerilimiCarpani = root["tAkuGC"] | 0.5;
	
	//Arduino'nun kendi çektiği akımın sıfırlamadaki değeri
	cfg.akuAkimEk = root["akuAE"] | 7;

	//Sensörlerin otomatik sıfırlanması için olması gereken değerden farkının kaç olması gerektiği
	cfg.sensorAmperFarki = root["sensorAF"] | 0.4;

	//Fanın çalışma sınırları
	cfg.fanPanelAmperi = root["fanPA"] | 2;
	cfg.fanAkuAmperi = root["fanAA"] | 5;

	//Aydınlatmaların açılıp kapanma sınırları
	cfg.aydinlatmaPanelVoltu = root["aPV"] | 2;
	cfg.aydinlatmaAcmaAkuVoltu = root["aAAV"] | 12.5;
	cfg.bahceAydinlatmaKapatmaAkuVoltu = root["bAKAV"] | 12.3;
	cfg.lavaboAydinlatmaKapatmaAkuVoltu = root["lAKAV"] | 12.2;
	
	//Geçici ayarlamaların kaç döngüden sonra geçersiz kılınacağı
	cfg.geciciFanSiniri = root["gFS"] | 30000;
	cfg.geciciAydinlatmaSiniri = root["gAS"] | 30000;

	//Elle yapılan kalıcı ayarlar
	//0 kalıcı kapalı, 1 kalıcı açık, 2 otomatik
	cfg.fanAyari = root["fanA"] | 2;
	cfg.bahceAydinlatmaAyari = root["bAA"] | 2;
	cfg.lavaboAydinlatmaAyari = root["lAA"] | 2;

	//Panelden çekilebilecek en yüksek akım. Arayüzde yüzde hesabı için kullanılır
	cfg.panelEnYuksekAkim = root["pEYA"] | 3.2;
	//Alınan gücün gerilimi. Arayüzde alınan güç hesabı için kullanılır
	cfg.sarjVoltu = root["sV"] | 14.5;
	
	//Aküden çekilen akım kaç amperi geçtiğinde gücün kesileceği
	cfg.akuAkimSiniri = root["aAS"] | 18;
	//Akünün gerilimi kaç voltun altına düşerse gücün kesileceği
	cfg.derinDesarjVoltu = root["dDV"] | 11.5;

	//Şarj başlatma/durdurma sınırları
	cfg.panelSarjBaslangicVoltu = root["pSBV"] | 19;
	cfg.akuSarjBaslangicVoltu = root["aSBV"] | 13.1;
	cfg.panelSarjDurdurmaAmperi = root["pSDA"] | 0.1;
	//Şarj durdurma voltu tahmini akü voltuyla karşılaştırılır. tahminiAkuGerilimiCarpani 0 yapıldığında gerçek volt dikkate alınır.
	cfg.akuSarjDurdurmaVoltu = root["aSDV"] | 14;
	
	//Panelin verdiği güç sınır sarj durdurma sınırında olduğunda röleler sık sık kapanıp açılacak ve ömrü kısalacaktır. 
	//Bunu önlemek için sarj ediliyorken sarj durdurma koşulları sağlandıysa belirlenen sayıda görmezden gelinecek.
	cfg.gormezdenGelmeSayisi = root["gGS"] | 50;

	//Sensör pinleri
	cfg.akuGerilimPini = root["aGP"] | A8;
	cfg.panelGerilimPini = root["pGP"] | A9;
	cfg.panelAkimPini = root["pAP"] | A10;
	cfg.akuAkimPini = root["aAP"] | A11;
	
	//Röle pinleri
	cfg.fanR = root["fanR"] | 32;
	cfg.bahceR = root["bahceR"] | 33;
	cfg.lavaboR = root["lavaboR"] | 34;
	cfg.panelR = root["panelR"] | 38;
	
	//Giriş bilgileri
	cfg.yonetici = root["yonetici"] | "yonetici";
	//Varsayılan parolanın karıştırılmamış hali: 65.19
	cfg.key = root["key"] | "ea818182a9705ee26d914191f1022e87";	
	//Yöneticiden tek farkı sol sidebarda sadece anasayfa ve çıkış butonlarının olması
	cfg.kullanici = root["kullanici"] | "kullanici";

	//Cross-Origin Resource Sharing siteleri
	cfg.corsSiteleri = root["corsS"] | "http://127.0.0.1";

	//cfg. = root[""] | ;	
	
	file.close();
}

// Saves the configuration to a file
int updateConfig(String cfgF) {
	delay(1);
	_get = "";
	_post = "";
	_cookie = "";
	// Delete existing file, otherwise the configuration is appended to the file
	SD.remove(cfgF);

	// Open file for writing
	File file = SD.open(cfgF, FILE_WRITE);
	if (!file) {
		return -1;
	}

	// Allocate the memory pool on the stack
	// Don't forget to change the capacity to match your JSON document.
	// Use https://arduinojson.org/assistant/ to compute the capacity.
	StaticJsonBuffer<1500> jsonBuffer;

	// Parse the root object
	JsonObject &root = jsonBuffer.createObject();

	// Set the values
	root["led"] = cfg.led;
	root["dSiniri"] = cfg.donguSiniri;
	root["panelVC"] = cfg.panelVoltCarpani;
	root["akuVC"] = cfg.akuVoltCarpani; 
	root["akuAC"] = cfg.akuAmperCarpani;
	root["panelAC"] = cfg.panelAmperCarpani; 
	root["tAkuGC"] = cfg.tahminiAkuGerilimiCarpani;
	root["akuAE"] = cfg.akuAkimEk; 
	root["sensorAF"] = cfg.sensorAmperFarki;
	root["fanPA"] = cfg.fanPanelAmperi;
	root["fanAA"] = cfg.fanAkuAmperi;
	root["aPV"] = cfg.aydinlatmaPanelVoltu;
	root["aAAV"] = cfg.aydinlatmaAcmaAkuVoltu;
	root["bAKAV"] = cfg.bahceAydinlatmaKapatmaAkuVoltu;
	root["lAKAV"] = cfg.lavaboAydinlatmaKapatmaAkuVoltu;
	root["gFS"] = cfg.geciciFanSiniri;
	root["gAS"] = cfg.geciciAydinlatmaSiniri;
	root["fanA"] = cfg.fanAyari;
	root["bAA"] = cfg.bahceAydinlatmaAyari;
	root["lAA"] = cfg.lavaboAydinlatmaAyari;
	root["pEYA"] = cfg.panelEnYuksekAkim;
	root["sV"] = cfg.sarjVoltu;
	root["aAS"] = cfg.akuAkimSiniri;
	root["dDV"] = cfg.derinDesarjVoltu;
	root["pSBV"] = cfg.panelSarjBaslangicVoltu;
	root["aSBV"] = cfg.akuSarjBaslangicVoltu;
	root["pSDA"] = cfg.panelSarjDurdurmaAmperi;
	root["aSDV"] = cfg.akuSarjDurdurmaVoltu;
	root["gGS"] = cfg.gormezdenGelmeSayisi;
	root["aGP"] = cfg.akuGerilimPini;
	root["pGP"] = cfg.panelGerilimPini;
	root["pAP"] = cfg.panelAkimPini;
	root["aAP"] = cfg.akuAkimPini;
	root["fanR"] = cfg.fanR;
	root["bahceR"] = cfg.bahceR;
	root["lavaboR"] = cfg.lavaboR;
	root["panelR"] = cfg.panelR;
	root["yonetici"] = cfg.yonetici;
	root["key"] = cfg.key;
	root["kullanici"] = cfg.kullanici;
	root["corsS"] = cfg.corsSiteleri;

	// Serialize JSON to file
	if (root.printTo(file) == 0) {
		return 0;
	}
	
	// Close the file (File's destructor doesn't close the file)
	file.close();
	if(cfgF = "cfg.txt") logla("Ayarlar guncellendi");
	return 1;
}

void printDirectory(File dir, int numTabs) {
	while (true) {

		File entry =	dir.openNextFile();
		if (! entry) {
			// no more files
			break;
		}
		for (uint8_t i = 0; i < numTabs; i++) {
			client.print('\t');
		}
		client.print(entry.name());
		if (entry.isDirectory()) {
			client.println("/");
			printDirectory(entry, numTabs + 1);
		} else {
			// files have sizes, directories do not
			client.print("\t\t");
			client.println(entry.size(), DEC);
		}
		entry.close();
	}
}

String md5(String str)
{
	char chr[str.length()+1];
	str.toCharArray(chr, str.length()+1);
	unsigned char* hash=MD5::make_hash(chr);
	//generate the digest (hex encoding) of our hash
	char *md5str = MD5::make_digest(hash, 16);

	str = md5str;
	//Give the Memory back to the System if you run the md5 Hash generation in a loop
	free(md5str);
	//free dynamically allocated 16 byte hash from make_hash()
	free(hash);
	return str;
}


String urldecode(String str)
{
    //https://github.com/zenmanenergy/ESP8266-Arduino-Examples/blob/master/helloWorld_urlencoded/urlencode.ino
    String encodedString="";
    char c;
    char code0;
    char code1;
    for (int i =0; i < str.length(); i++){
        c=str.charAt(i);
      if (c == '+'){
        encodedString+=' ';  
      }else if (c == '%') {
        i++;
        code0=str.charAt(i);
        i++;
        code1=str.charAt(i);
        c = (h2int(code0) << 4) | h2int(code1);
        encodedString+=c;
      } else{
        
        encodedString+=c;  
      }
      
      yield();
    }
    
   return encodedString;
}

unsigned char h2int(char c)
{
    if (c >= '0' && c <='9'){
        return((unsigned char)c - '0');
    }
    if (c >= 'a' && c <='f'){
        return((unsigned char)c - 'a' + 10);
    }
    if (c >= 'A' && c <='F'){
        return((unsigned char)c - 'A' + 10);
    }
    return(0);
}