package co.edu.ggm.asistencia.config;

import java.time.Duration;

import org.springframework.context.annotation.Configuration;
import org.springframework.http.CacheControl;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.ViewControllerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Reenvia las rutas de React Router al index de la SPA.
 * El patron excluye lo que lleva punto (ficheros como .js o .png, que deben dar
 * 404 de verdad si no existen) y no toca /api, que resuelve antes por especifico.
 */
@Configuration
public class SpaConfig implements WebMvcConfigurer {

    /**
     * Spring Security pone "Cache-Control: no-store" a todo, y Safari/iOS se niega a
     * reproducir un video servido asi (no puede pedir rangos sobre algo que no puede
     * guardar). Los videos son publicos e inmutables: se cachean y listo.
     */
    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        registry.addResourceHandler("/videos/**")
                .addResourceLocations("classpath:/static/videos/")
                .setCacheControl(CacheControl.maxAge(Duration.ofDays(30)).cachePublic());
    }

    @Override
    public void addViewControllers(ViewControllerRegistry registry) {
        registry.addViewController("/{ruta:[^\\.]*}").setViewName("forward:/index.html");
        // Un solo segmento no basta: /asistencia/:blockId/:fecha tiene tres, y al
        // recargar esa URL el servidor devolvia el 404 del manejador de estaticos.
        registry.addViewController("/{a:[^\\.]*}/{b:[^\\.]*}").setViewName("forward:/index.html");
        registry.addViewController("/{a:[^\\.]*}/{b:[^\\.]*}/{c:[^\\.]*}")
                .setViewName("forward:/index.html");
    }
}
